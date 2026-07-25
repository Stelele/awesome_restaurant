frappe.provide("awesome_restaurant3");

(function () {
	var _orig_on_page_load = frappe.pages["point-of-sale"].on_page_load;

	frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
		var _orig_require = frappe.require;

		frappe.require = function (items, callback) {
			if (items === "point-of-sale.bundle.js") {
				return _orig_require(items, function () {
					if (callback) callback();
					_orig_require("restaurant_pos.bundle.js", function () {
						var _attempts = 0;
						var _do_replace = function () {
							var apps = document.querySelectorAll(".point-of-sale-app");
							if (apps.length === 0 && _attempts < 25) {
								_attempts++;
								setTimeout(_do_replace, 80);
								return;
							}

							var pos = wrapper.pos;

							if (typeof onScan !== "undefined" && onScan.detachFrom && onScan.isAttachedTo(document)) {
								try { onScan.detachFrom(document); } catch (e) {}
							}
							apps.forEach(function (el) { el.remove(); });

							frappe.ui.make_app_page({
								parent: wrapper,
								title: __("Point of Sale"),
								single_column: true,
								hide_sidebar: true,
							});
							pos.page = wrapper.page;

							pos.cart = null;
							pos.item_selector = null;
							pos.payment = null;
							pos.item_details = null;
							pos.order_summary = null;
							pos.recent_order_list = null;
							pos.table_selector = null;
							pos.current_table_doc = null;
							pos.$table_badge = null;
							pos.table_mode = false;
							pos._kitchen_sent = false;
							pos._tip_item_code = null;

							var proto = awesome_restaurant3.RestaurantPosController.prototype;
							pos.init_item_selector = proto.init_item_selector;
							pos.init_item_cart = proto.init_item_cart;
							pos.init_item_details = proto.init_item_details;
							pos.init_payments = proto.init_payments;
							pos.init_order_summary = proto.init_order_summary;
							pos.init_recent_order_list = proto.init_recent_order_list;
							pos.make_app = proto.make_app;
							pos.load_table_grid = proto.load_table_grid;
							pos.select_table = proto.select_table;
							pos.go_back_to_tables = proto.go_back_to_tables;
							pos.render_table_badge = proto.render_table_badge;
							pos.remove_table_badge = proto.remove_table_badge;
							pos._fix_table_grid_css = proto._fix_table_grid_css;

							pos.make_app();
						};
						_do_replace();
					});
				});
			}
			return _orig_require(items, callback);
		};

		_orig_on_page_load(wrapper);

		frappe.require = _orig_require;
	};
})();

frappe.pages["point-of-sale"].refresh = function (wrapper) {
	if (document.scannerDetectionData) {
		onScan.detachFrom(document);
		wrapper.pos.wrapper.html("");
		wrapper.pos.check_opening_entry();
	}
	if (wrapper.pos && wrapper.pos.table_mode && (!wrapper.pos.frm || wrapper.pos.frm.doc?.docstatus === 1)) {
		wrapper.pos.load_table_grid();
	}
};

frappe.pages["point-of-sale"].on_page_show = function (wrapper) {
	if (wrapper.pos) {
		wrapper.pos._fix_table_grid_css();
	}
};
