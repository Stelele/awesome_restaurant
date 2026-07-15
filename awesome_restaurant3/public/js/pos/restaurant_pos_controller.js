class RestaurantPosController extends erpnext.PointOfSale.Controller {
  make_app() {
    this.prepare_dom();
    this.prepare_components();
    this.prepare_menu();
    this.prepare_btns();

    const table_count = this.settings?.restaurant_table_count;
    if (table_count > 0) {
      this.table_count = table_count;
      this.table_drafts = {};
      this.current_table = null;
      this.table_selector = new awesome_restaurant3.TableSelector({
        wrapper: this.$components_wrapper,
        table_count: this.table_count,
        table_drafts: this.table_drafts,
        events: {
          select_table: (table_name) => this.select_table(table_name),
          clear_table: (table_name) => this.clear_table(table_name),
        },
      });
      this.toggle_components(false);
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

  select_table(table_name) {
    this.current_table = table_name;

    if (this.table_drafts[table_name]) {
      const existing_name = this.table_drafts[table_name].name;
      this.table_selector.hide();
      this.render_table_badge();
      this.load_existing_table_draft(existing_name, table_name);
    } else {
      this.make_new_invoice().then(() => {
        this.table_selector.hide();
        this.render_table_badge();
        this.frm.doc.restaurant_table = table_name;
        this.table_drafts[table_name] = {
          name: this.frm.doc.name,
          total: 0,
          items: 0,
          modified: this.frm.doc.modified,
        };
        this.toggle_components(true);
      }).catch(() => {
        this.current_table = null;
        frappe.show_alert({
          message: __("Failed to create draft for {0}", [table_name]),
          indicator: "red",
        });
      });
    }
  }

  load_existing_table_draft(docname, table_name) {
    const doctype = this.settings.frm_doctype;
    frappe.run_serially([
      () => frappe.dom.freeze(),
      () => this.make_invoice_frm(doctype),
      () => {
        return frappe.db.get_doc(doctype, docname).then((doc) => {
          frappe.model.sync(doc);
          this.frm.refresh(docname);
        });
      },
      () => this.frm.call("reset_mode_of_payments"),
      () => this.cart.load_invoice(),
      () => {
        this.frm.doc.restaurant_table = table_name;
        this.toggle_components(true);
        frappe.dom.unfreeze();
      },
    ]).catch(() => {
      frappe.dom.unfreeze();
      frappe.show_alert({
        message: __("Failed to load draft for {0}", [table_name]),
        indicator: "red",
      });
      this.go_back_to_tables();
    });
  }

  clear_table(table_name) {
    const draft = this.table_drafts[table_name];
    if (!draft) return;

    frappe.model.delete_doc(this.settings.frm_doctype, draft.name, () => {
      delete this.table_drafts[table_name];
      if (this.current_table === table_name) {
        this.current_table = null;
        this.frm = null;
        this.toggle_components(false);
      }
      this.table_selector.refresh(this.table_drafts);
      this.table_selector.show();
      frappe.show_alert({
        message: __("{0} cleared", [table_name]),
        indicator: "green",
      });
    });
  }

  make_new_invoice() {
    return super.make_new_invoice().then(() => {
      if (this.current_table) {
        this.frm.doc.restaurant_table = this.current_table;
      }
    });
  }

  new_invoice_event() {
    if (this.table_count > 0) {
      this.go_back_to_tables();
      return;
    }
    super.new_invoice_event();
  }

  go_back_to_tables() {
    if (this.current_table) {
      this._update_table_draft_state();
    }
    this.current_table = null;
    this.frm = null;
    this.remove_table_badge();
    if (this.payment && this.payment.$component) {
      this.payment.toggle_component(false);
    }
    this.toggle_components(false);
    this.table_selector.refresh(this.table_drafts);
    this.table_selector.show();
  }

  render_table_badge() {
    this.remove_table_badge();
    const html = `
      <div class="pos-table-badge" id="pos-table-badge">
        <span class="pos-table-badge__arrow">&larr;</span>
        <span class="pos-table-badge__label">${this.current_table || ""}</span>
      </div>`;
    this.$table_badge = $(html).on("click", () => this.go_back_to_tables());
    this.$components_wrapper.prepend(this.$table_badge);
  }

  remove_table_badge() {
    if (this.$table_badge) {
      this.$table_badge.remove();
      this.$table_badge = null;
    }
  }

  _update_table_draft_state() {
    const table = this.current_table;
    if (!table || !this.frm?.doc) return;
    this.table_drafts[table] = {
      name: this.frm.doc.name,
      total: this.frm.doc.grand_total || 0,
      items: this.frm.doc.items?.length || 0,
      modified: this.frm.doc.modified,
    };
  }

  toggle_submitted_invoice_summary(show) {
    if (this.table_count > 0) {
      if (this.current_table) {
        delete this.table_drafts[this.current_table];
      }
      const table = this.current_table;
      this.current_table = null;
      this.frm = null;
      this.remove_table_badge();
      this.table_selector.refresh(this.table_drafts);
      this.table_selector.show();
      frappe.show_alert({
        message: table ? __("{0} paid", [table]) : __("Invoice submitted"),
        indicator: "green",
      });
      return;
    }
    super.toggle_submitted_invoice_summary(show);
  }

  close_pos() {
    if (this.table_count > 0) {
      Object.values(this.table_drafts).forEach((draft) => {
        if (draft?.name) {
          frappe.call({
            method: "frappe.client.delete",
            args: {
              doctype: this.settings.frm_doctype,
              name: draft.name,
            },
          }).catch(() => {});
        }
      });
    }

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
