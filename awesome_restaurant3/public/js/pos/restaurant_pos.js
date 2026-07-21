frappe.provide("awesome_restaurant3");

frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __("Point of Sale"),
    single_column: true,
    hide_sidebar: true,
  });

  frappe.require("point-of-sale.bundle.js", function () {
    frappe.require("restaurant_pos.bundle.js", function () {
      wrapper.pos = new awesome_restaurant3.RestaurantPosController(wrapper);
      window.cur_pos = wrapper.pos;
    });
  });
};

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
