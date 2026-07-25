frappe.provide("awesome_restaurant3");

(function () {
	var _orig_on_page_load = frappe.pages["point-of-sale"].on_page_load;

	frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
		_orig_on_page_load(wrapper);

		frappe.require("restaurant_pos.bundle.js", function () {
			var _attempts = 0;
			var _do_replace = function () {
				var apps = document.querySelectorAll(".point-of-sale-app");
				if (apps.length === 0 && _attempts < 25) {
					_attempts++;
					setTimeout(_do_replace, 80);
					return;
				}
				if (typeof onScan !== "undefined" && onScan.detachFrom) {
					onScan.detachFrom(document);
				}
				apps.forEach(function (el) { el.remove(); });
				wrapper.pos = new awesome_restaurant3.RestaurantPosController(wrapper);
				window.cur_pos = wrapper.pos;
			};
			_do_replace();
		});
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
