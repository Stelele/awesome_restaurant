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
						var _orig_make_app = erpnext.PointOfSale.Controller.prototype.make_app;

						erpnext.PointOfSale.Controller.prototype.make_app = function () {
							if (_restaurant_setup_done) return;
						};

						if (callback) callback();

						var _pos = wrapper.pos;

						var _wait_for_profile = function () {
							if (_pos.pos_profile) {
								if (!_pos.settings) _pos.settings = {};
								if (!_pos.settings.frm_doctype) _pos.settings.frm_doctype = "POS Invoice";
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
								_pos._restaurant_make_app_done = false;

								Object.getOwnPropertyNames(awesome_restaurant3.RestaurantPosController.prototype).forEach(function (name) {
									if (name !== "constructor" && typeof awesome_restaurant3.RestaurantPosController.prototype[name] === "function") {
										_pos[name] = awesome_restaurant3.RestaurantPosController.prototype[name];
									}
								});

								if (typeof _pos.open_expense_modal !== "function" && typeof erpnext.PointOfSale.Controller?.prototype?.open_expense_modal === "function") {
									_pos.prepare_btns = erpnext.PointOfSale.Controller.prototype.prepare_btns;
									_pos.open_expense_modal = erpnext.PointOfSale.Controller.prototype.open_expense_modal;
									_pos.open_reprint_invoices_modal = erpnext.PointOfSale.Controller.prototype.open_reprint_invoices_modal;
									_pos.open_refund_invoices_modal = erpnext.PointOfSale.Controller.prototype.open_refund_invoices_modal;
								}

								_pos.make_app().then(function () {
									erpnext.PointOfSale.Controller.prototype.make_app = _orig_make_app;
								});
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
	}
	if (wrapper.pos) {
		wrapper.pos.wrapper.html("");
		wrapper.pos.check_opening_entry();
	}
};

frappe.pages["point-of-sale"].on_page_show = function (wrapper) {
	if (wrapper.pos) {
		wrapper.pos._fix_table_grid_css();
	}
};
