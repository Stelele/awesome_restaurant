class RestaurantPosController extends erpnext.PointOfSale.Controller {
  async make_app() {
    this.prepare_dom();
    this.prepare_components();
    this.prepare_menu();
    this.prepare_btns();

    const table_count = await frappe.db.count("POS Table");
    if (table_count > 0) {
      this.table_mode = true;
      await this.load_table_grid();
    } else {
      await this.make_new_invoice();
    }
  }

  init_item_selector() {
    this.item_selector = new erpnext.PointOfSale.ItemSelector({
      wrapper: this.$components_wrapper,
      pos_profile: this.pos_profile,
      settings: this.settings,
      events: {
        item_selected: (args) => this.on_cart_update(args),
        get_frm: () => this.frm || { doc: {} },
      },
    });
    if (this.settings?.selling_price_list) {
      this.item_selector.price_list = this.settings.selling_price_list;
    }
  }

  async on_cart_update(args) {
    this._cart_modified = true;
    return super.on_cart_update(args);
  }

  async load_table_grid() {
    const tables = await frappe.db.get_list("POS Table", {
      filters: [["POS Table Profile", "pos_profile", "=", this.pos_profile]],
      fields: ["name", "table_number", "status", "current_invoice", "current_invoice_doctype", "modified"],
      order_by: "table_number",
    });

    this.toggle_components(false);

    if (this.table_selector) {
      this.table_selector.refresh(tables);
    } else {
      this.table_selector = new awesome_restaurant3.TableSelector({
        wrapper: this.$components_wrapper,
        tables: tables,
        events: {
          select_table: (table_number) => this.select_table(table_number),
          clear_table: (table_number) => this.clear_table(table_number),
        },
      });
      frappe.realtime.off("pos_table_update");
      frappe.realtime.on("pos_table_update", (data) => {
        if (this.table_selector) {
          this.table_selector.update_table(data);
        }
      });
    }

    this._fix_table_grid_css();
    this.table_selector.show();
  }

  _fix_table_grid_css() {
    $("body > .datepicker--open, body > .datepicker--nav, body > .datepicker--content, "
      + ".datepicker--open, .datepicker--nav, .datepicker--content, "
      + "[data-datepicker], .dtpicker, .picker, .daterangepicker")
      .remove();
  }

  async select_table(table_number) {
    const docs = await frappe.db.get_list("POS Table", {
      filters: { table_number },
      fields: ["name", "table_number", "status", "current_invoice", "current_invoice_doctype"],
    });
    const table = docs[0];
    if (!table) return;

    this.current_table_doc = table;
    this._cart_modified = false;
    this.table_selector.hide();
    this.render_table_badge();

    if (table.status === "Occupied" && table.current_invoice && table.current_invoice_doctype) {
      const exists = await frappe.db.exists(table.current_invoice_doctype, table.current_invoice);
      if (exists) {
        await this.load_existing_table_draft(table.current_invoice, table.current_invoice_doctype, table_number);
        return;
      }
    }

    await this.make_new_invoice();
    await frappe.db.set_value("POS Table", table.name, {
      status: "Occupied",
      current_invoice: null,
      current_invoice_doctype: null,
    });
    this.toggle_components(true);
  }

  async load_existing_table_draft(docname, doctype, table_name) {
    try {
      if (!this.frm || this.frm.doctype !== doctype) {
        await this.make_invoice_frm(doctype);
      }
      const doc = await frappe.db.get_doc(doctype, docname);
      frappe.model.sync(doc);
      this.frm.refresh(docname);
      this.frm.doc.restaurant_table = table_name;
      this._cart_modified = false;
      this.cart.load_invoice();
      this.toggle_components(true);
    } catch (err) {
      this.frm = null;
      this.remove_table_badge();
      this.current_table_doc.status = "Free";
      this.current_table_doc.current_invoice = null;
      await this.select_table(table_name);
    }
  }

  async clear_table(table_number) {
    const docs = await frappe.db.get_list("POS Table", {
      filters: { table_number },
      fields: ["name", "current_invoice", "current_invoice_doctype"],
    });
    const table = docs[0];
    if (!table) return;

    if (table.current_invoice && table.current_invoice_doctype) {
      frappe.db.get_doc(table.current_invoice_doctype, table.current_invoice).then(doc => {
        if (doc.docstatus === 0) {
          return frappe.db.delete_doc(table.current_invoice_doctype, table.current_invoice);
        }
      }).catch(() => {});
    }
    await frappe.db.set_value("POS Table", table.name, {
      status: "Free",
      current_invoice: null,
      current_invoice_doctype: null,
    });

    if (this.current_table_doc?.table_number === table_number) {
      this.current_table_doc = null;
      this.frm = null;
      this.remove_table_badge();
    }

    await this.load_table_grid();
    frappe.show_alert({ message: __("{0} cleared", [table_number]), indicator: "green" });
  }

  make_new_invoice() {
    return super.make_new_invoice().then(() => {
      if (this.current_table_doc) {
        this.frm.doc.restaurant_table = this.current_table_doc.table_number;
      }
    });
  }

  new_invoice_event() {
    if (this.table_mode) {
      this.go_back_to_tables();
      return;
    }
    super.new_invoice_event();
  }

  async go_back_to_tables() {
    if (this.current_table_doc && this.frm) {
      const items_count = this.frm?.doc?.items?.length || 0;
      if (items_count === 0) {
        await frappe.db.set_value("POS Table", this.current_table_doc.name, {
          status: "Free",
          current_invoice: null,
          current_invoice_doctype: null,
        });
        if (!this.frm.doc.__islocal) {
          try { await frappe.db.delete_doc(this.frm.doc.doctype, this.frm.doc.name); } catch (e) {}
        }
      } else {
        if (this._cart_modified) {
          await this.frm.save();
        }
        await frappe.db.set_value("POS Table", this.current_table_doc.name, {
          status: "Occupied",
          current_invoice: this.frm.doc.name,
          current_invoice_doctype: this.settings.frm_doctype,
        });
      }
    }
    this.current_table_doc = null;
    this.remove_table_badge();
    if (this.payment && this.payment.$component) {
      this.payment.toggle_component(false);
    }
    await this.load_table_grid();
  }

  render_table_badge() {
    this.remove_table_badge();
    const html = `
      <div class="pos-table-badge" id="pos-table-badge">
        <span class="pos-table-badge__arrow">&larr;</span>
        <span class="pos-table-badge__label">${this.current_table_doc?.table_number || ""}</span>
      </div>`;
    this.$table_badge = $(html).on("click", () => this.go_back_to_tables());
    this.$components_wrapper.prepend(this.$table_badge);
    this._fix_table_grid_css();
  }

  remove_table_badge() {
    if (this.$table_badge) {
      this.$table_badge.remove();
      this.$table_badge = null;
    }
  }

  async toggle_submitted_invoice_summary(show) {
    if (this.table_mode) {
      if (this.current_table_doc) {
        await frappe.db.set_value("POS Table", this.current_table_doc.name, {
          status: "Free",
          current_invoice: null,
          current_invoice_doctype: null,
        });
      }
      this.current_table_doc = null;
      this.remove_table_badge();
      await this.load_table_grid();
      return;
    }
    super.toggle_submitted_invoice_summary(show);
  }

  check_outdated_pos_opening_entry() {
  }

  close_pos() {
    if (this.frm) {
      super.close_pos();
      return;
    }
    if (!this.$components_wrapper.is(":visible")) return;
    let voucher = frappe.model.get_new_doc("POS Closing Entry");
    voucher.pos_profile = this.pos_profile;
    voucher.user = frappe.session.user;
    voucher.company = this.company;
    voucher.pos_opening_entry = this.pos_opening;
    voucher.period_end_date = frappe.datetime.now_datetime();
    voucher.posting_date = frappe.datetime.now_date();
    voucher.posting_time = frappe.datetime.now_time();
    frappe.set_route("Form", "POS Closing Entry", voucher.name);
  }
}

awesome_restaurant3.RestaurantPosController = RestaurantPosController;
