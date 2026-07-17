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
      this.make_new_invoice();
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

  async load_table_grid() {
    const { message: tables } = await frappe.call({
      method: "awesome_restaurant3.awesome_restaurant3.doctype.pos_table.pos_table.get_tables_for_profile",
      args: { pos_profile: this.pos_profile },
    });

    this.toggle_components(false);

    if (this.table_selector) {
      this.table_selector.refresh(tables);
    } else {
      this.table_selector = new awesome_restaurant3.TableSelector({
        wrapper: this.$components_wrapper,
        tables: tables,
        events: {
          select_table: (table_name) => this.select_table(table_name),
          clear_table: (table_name) => this.clear_table(table_name),
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
    this.wrapper.find(".pos-table-grid-wrapper").css("grid-column", "1 / -1");
    this.wrapper.find(".pos-table-badge").css({
      "grid-column": "1 / -1",
      "background": "var(--bg-light-gray)",
      "border-bottom": "1px solid var(--border-color)",
      "padding": "10px 20px",
      "margin": "0",
      "border-radius": "0",
    });
    $(".datepicker--open, .datepicker--nav, .datepicker--content, [data-datepicker], .dtpicker").remove();
  }

  async select_table(table_number) {
    const docs = await frappe.db.get_list("POS Table", {
      filters: { table_number: table_number },
      fields: ["name", "table_number", "status", "current_invoice", "current_invoice_doctype"],
    });
    const table = docs[0];
    if (!table) return;

    this.current_table_doc = table;

    if (table.status === "Occupied" && table.current_invoice) {
      this.table_selector.hide();
      this.render_table_badge();
      this.load_existing_table_draft(table.current_invoice, table.current_invoice_doctype, table_number);
    } else {
      this.table_selector.hide();
      this.render_table_badge();
      this.make_new_invoice().then(async () => {
        this.frm.doc.restaurant_table = table_number;
        await frappe.db.set_value("POS Table", table.name, {
          status: "Occupied",
          current_invoice: this.frm.doc.name,
          current_invoice_doctype: this.settings.frm_doctype,
        });
        this.toggle_components(true);
      }).catch(() => {
        this.current_table_doc = null;
        frappe.show_alert({
          message: __("Failed to create draft for {0}", [table_number]),
          indicator: "red",
        });
        this.load_table_grid().then(() => this.table_selector.show());
      });
    }
  }

  async load_existing_table_draft(docname, doctype, table_name) {
    try {
      if (!this.frm || this.frm.doctype !== doctype) {
        await this.make_invoice_frm(doctype);
      }
      const doc = await frappe.db.get_doc(doctype, docname);
      frappe.model.sync(doc);
      this.frm.refresh(docname);
      await this.frm.call("reset_mode_of_payments");
      this.cart.load_invoice();
      this.frm.doc.restaurant_table = table_name;
      this.toggle_components(true);
    } catch (err) {
      this.current_table_doc = null;
      this.frm = null;
      this.remove_table_badge();
      frappe.show_alert({
        message: __("Could not load draft. It may have been deleted."),
        indicator: "red",
      });
      await this.load_table_grid();
      this.table_selector.show();
    }
  }

  async clear_table(table_number) {
    const docs = await frappe.db.get_list("POS Table", {
      filters: { table_number: table_number },
      fields: ["name", "current_invoice", "current_invoice_doctype"],
    });
    const table = docs[0];
    if (!table) return;

    if (table.current_invoice) {
      frappe.model.delete_doc(table.current_invoice_doctype, table.current_invoice, () => {});
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
        if (this.frm.doc && this.frm.doc.name) {
          try { await this.frm.doc.cancel(); } catch (e) {}
        }
        await frappe.db.set_value("POS Table", this.current_table_doc.name, {
          status: "Free",
          current_invoice: null,
          current_invoice_doctype: null,
        });
      } else {
        try {
          await frappe.call({
            method: "frappe.desk.form.save.savedocs",
            args: { doc: JSON.stringify(this.frm.doc), action: "Save" },
          });
        } catch (e) {}
      }
    }
    this.current_table_doc = null;
    this.frm = null;
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

  toggle_submitted_invoice_summary(show) {
    if (this.table_mode) {
      const table_number = this.current_table_doc?.table_number;
      if (this.current_table_doc) {
        frappe.db.set_value("POS Table", this.current_table_doc.name, {
          status: "Free",
          current_invoice: null,
          current_invoice_doctype: null,
        }).then(() => {
          frappe.show_alert({
            message: table_number ? __("{0} paid", [table_number]) : __("Invoice submitted"),
            indicator: "green",
          });
        });
      }
      this.current_table_doc = null;
      this.frm = null;
      this.remove_table_badge();
      this.load_table_grid();
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
