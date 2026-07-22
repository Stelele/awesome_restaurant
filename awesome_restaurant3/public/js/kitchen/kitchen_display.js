frappe.provide("awesome_restaurant3");

frappe.pages["kitchen-display"].on_page_load = function (wrapper) {
	if (!(frappe.user.has_role("Kitchen User") || frappe.user.has_role("System Manager"))) {
		frappe.set_route("/app");
		return;
	}

	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Kitchen Display"),
		single_column: true,
		hide_sidebar: true,
	});

	frappe.require("kitchen_display.bundle.js", function () {
		wrapper.kitchen = new awesome_restaurant3.KitchenDisplayController(wrapper);
	});
};
