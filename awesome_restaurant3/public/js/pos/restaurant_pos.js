frappe.provide("awesome_restaurant3");

(function () {
	var _orig_on_page_load = frappe.pages["point-of-sale"].on_page_load;

	frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
		var _orig_require = frappe.require;

		frappe.require = function (items, callback) {
			if (items === "point-of-sale.bundle.js") {
				return _orig_require(items, function () {
					_orig_require("restaurant_pos.bundle.js", function () {
						wrapper.pos = new awesome_restaurant3.RestaurantPosController(wrapper);
						window.cur_pos = wrapper.pos;
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
