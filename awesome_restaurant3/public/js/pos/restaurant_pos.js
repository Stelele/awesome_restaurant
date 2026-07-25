frappe.provide("awesome_restaurant3");

(function () {
	var _orig_on_page_load = frappe.pages["point-of-sale"].on_page_load;

	frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
		var _orig_require = frappe.require;

		frappe.require = function (items, callback) {
			if (items === "point-of-sale.bundle.js") {
				return _orig_require(items, function () {
					_orig_require("restaurant_pos.bundle.js", function () {
						var _restaurant_setup_done = false;
						var _orig_make_pos = erpnext.PointOfSale.Controller.prototype.make;

						erpnext.PointOfSale.Controller.prototype.make = function () {
							if (_restaurant_setup_done) return;
						};

						if (callback) callback();

						var _pos = wrapper.pos;

						var _wait_for_profile = function () {
							if (_pos.pos_profile) {
								_restaurant_setup_done = true;

								if (typeof onScan !== "undefined" && onScan.detachFrom && onScan.isAttachedTo(document)) {
									try { onScan.detachFrom(document); } catch (e) {}
								}
								document.querySelectorAll(".point-of-sale-app").forEach(function (el) { el.remove(); });

								_pos.cart = null;
								_pos.item_selector = null;
								_pos.payment = null;
								_pos.item_details = null;
								_pos.order_summary = null;
								_pos.recent_order_list = null;
								_pos.table_selector = null;
								_pos.current_table_doc = null;
								_pos.$table_badge = null;
								_pos.table_mode = false;
								_pos._kitchen_sent = false;
								_pos._tip_item_code = null;

								Object.setPrototypeOf(_pos, awesome_restaurant3.RestaurantPosController.prototype);
								_pos.make_app();

								erpnext.PointOfSale.Controller.prototype.make = _orig_make_pos;
							} else {
								setTimeout(_wait_for_profile, 50);
							}
						};
						_wait_for_profile();
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
