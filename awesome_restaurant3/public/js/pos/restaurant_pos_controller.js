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

  init_item_cart() {
    super.init_item_cart();
    this.cart.events.get_frm = () => this.frm || { doc: { items: [], currency: "" } };
  }

  init_order_summary() {
    super.init_order_summary();
    const parent_new_order = this.order_summary.events.new_order;
    this.order_summary.events.new_order = () => {
      if (this.table_mode) {
        this.go_back_to_tables();
        return;
      }
      parent_new_order();
    };
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
    const tables = await frappe.db.get_list("POS Table", {
      filters: [["POS Table Profile", "pos_profile", "=", this.pos_profile]],
      fields: ["name", "table_number", "status", "current_invoice", "current_invoice_doctype", "current_total", "current_item_count", "occupied_at", "modified"],
      order_by: "table_number",
    });

    tables.sort((a, b) => {
      const numA = parseInt(a.table_number.replace(/\D/g, ""), 10);
      const numB = parseInt(b.table_number.replace(/\D/g, ""), 10);
      return numA - numB;
    });

    const invoice_names = tables.filter((t) => t.current_invoice).map((t) => t.current_invoice);
    if (invoice_names.length) {
      const invoice_statuses = await frappe.db.get_list("POS Invoice", {
        filters: { name: ["in", invoice_names] },
        fields: ["name", "kitchen_status"],
      });
      const status_map = {};
      invoice_statuses.forEach((inv) => {
        status_map[inv.name] = inv.kitchen_status;
      });
      tables.forEach((t) => {
        if (t.current_invoice) {
          t.kitchen_status = status_map[t.current_invoice] || "";
        }
      });
    }

    this.toggle_components(false);

    if (this.table_selector) {
      this.table_selector.$component.remove();
    }
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

    this._fix_table_grid_css();
    this.$components_wrapper.addClass("restaurant-table-mode");
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
      fields: ["name", "table_number", "status", "current_invoice", "current_invoice_doctype", "occupied_at"],
    });
    const table = docs[0];
    if (!table) return;

    this.current_table_doc = table;
    this.current_table_doc._kitchen_sent = false;

    if (table.current_invoice && table.current_invoice_doctype) {
      const kstatus = await frappe.db.get_value(
        table.current_invoice_doctype,
        table.current_invoice,
        "kitchen_status"
      );
      if (kstatus?.kitchen_status === "Received") {
        this.current_table_doc._kitchen_sent = true;
      }
    }

    this.table_selector.hide();
    this.render_table_badge();

    if (table.status === "Occupied" && table.current_invoice && table.current_invoice_doctype) {
      const exists = await frappe.db.exists(table.current_invoice_doctype, table.current_invoice);
      if (exists) {
        await this.edit_table_draft(table.current_invoice, table.current_invoice_doctype, table_number);
        return;
      }
    }

    await this.make_new_invoice();
    await frappe.db.set_value("POS Table", table.name, {
      status: "Occupied",
      current_invoice: null,
      current_invoice_doctype: null,
      occupied_at: frappe.datetime.now_datetime(),
    });
    this.toggle_components(true);
  }

  async edit_table_draft(docname, doctype, table_name) {
    try {
      await new Promise((resolve) => {
        frappe.run_serially([
          () => this.make_invoice_frm(doctype),
          () => this.sync_draft_invoice_to_frm(doctype, docname),
          () => { this.frm.doc.restaurant_table = table_name; },
          () => this.frm.refresh(docname),
          () => {
            const orig = frappe.show_alert;
            frappe.show_alert = function (msg, ...args) {
              if (
                (typeof msg === "string" && msg.includes("Payment methods refreshed"))
                || msg?.message?.includes("Payment methods refreshed")
              ) { return; }
              return orig.call(this, msg, ...args);
            };
            return this.frm.call("reset_mode_of_payments").then(() => {
              frappe.show_alert = orig;
            });
          },
          () => this.cart.load_invoice(),
          () => this.toggle_components(true),
          () => resolve(),
        ]);
      });
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
      current_total: 0,
      current_item_count: 0,
      occupied_at: null,
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
    if (!this.current_table_doc) {
      return await this._navigate_to_grid();
    }
    if (this.frm?.doc?.items?.length === 0) {
      await frappe.db.set_value("POS Table", this.current_table_doc.name, {
        status: "Free",
        current_invoice: null,
        current_invoice_doctype: null,
        current_total: 0,
        current_item_count: 0,
        occupied_at: null,
      });
      if (!this.frm.doc.__islocal) {
        try { await frappe.db.delete_doc(this.frm.doc.doctype, this.frm.doc.name); } catch (e) {}
      }
      return await this._navigate_to_grid();
    }
    if (this.frm.is_dirty() || this.frm.is_new()) {
      let save_error = false;
      await this.frm.save(null, null, null, () => (save_error = true));
      if (save_error) return;
    }
    const occupied_at = this.current_table_doc.occupied_at
      ? this.current_table_doc.occupied_at
      : frappe.datetime.now_datetime();
    await frappe.db.set_value("POS Table", this.current_table_doc.name, {
      status: "Occupied",
      current_invoice: this.frm.doc.name,
      current_invoice_doctype: this.settings.frm_doctype,
      current_total: this.frm.doc.grand_total,
      current_item_count: this.frm.doc.items?.length || 0,
      occupied_at: occupied_at,
    });
    await this._navigate_to_grid();
  }

  async _navigate_to_grid() {
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
    const table = this.current_table_doc?.table_number || "";
    const already_sent = this.current_table_doc?._kitchen_sent;
    const action_html = already_sent
      ? `<span class="pos-table-badge__sent-label">${__("Order Sent")}</span>`
      : `<button class="btn btn-primary btn-sm pos-table-badge__send-btn" id="pos-send-kitchen-btn" style="margin-left:auto;background-color:#2490ef;color:#fff">${__("Send to Kitchen")}</button>`;
    const html = `
      <div class="pos-table-badge" id="pos-table-badge">
        <span class="pos-table-badge__arrow">&larr;</span>
        <span class="pos-table-badge__label">${table}</span>
        ${action_html}
      </div>`;
    this.$table_badge = $(html);

    this.$components_wrapper.prepend(this.$table_badge);

    this.$table_badge.on("click", (e) => {
      if ($(e.target).is("#pos-send-kitchen-btn") || $(e.target).closest("#pos-send-kitchen-btn").length) {
        this.send_to_kitchen();
      } else {
        this.go_back_to_tables();
      }
    });

    this._fix_table_grid_css();
  }

  async send_to_kitchen() {
    if (!this.frm || !this.frm.doc.name) {
      frappe.show_alert({ message: __("No active order to send"), indicator: "orange" });
      return;
    }

    if (!this.frm.doc.items || this.frm.doc.items.length === 0) {
      frappe.show_alert({ message: __("Cannot send empty order"), indicator: "orange" });
      return;
    }

    if (this.frm.is_dirty() || this.frm.is_new()) {
      let save_error = false;
      await this.frm.save(null, null, null, () => (save_error = true));
      if (save_error) {
        frappe.show_alert({ message: __("Failed to save order"), indicator: "red" });
        return;
      }
    }

    try {
      await frappe.call({
        method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.send_order_to_kitchen",
        args: { invoice_name: this.frm.doc.name },
      });
      if (this.current_table_doc) {
        this.current_table_doc._kitchen_sent = true;
        await frappe.db.set_value("POS Table", this.current_table_doc.name, {
          current_invoice: this.frm.doc.name,
          current_invoice_doctype: this.frm.doctype,
          current_total: this.frm.doc.grand_total,
          current_item_count: this.frm.doc.items?.length || 0,
        });
      }
      frappe.show_alert({
        message: __("Order sent to kitchen"),
        indicator: "green",
      });
      if (this.table_selector && this.current_table_doc) {
        this.table_selector.mark_kitchen_sent(this.current_table_doc.table_number);
      }
    } catch (err) {
      frappe.show_alert({ message: __("Failed to send order"), indicator: "red" });
    }
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
          current_total: 0,
          current_item_count: 0,
          occupied_at: null,
        });
      }
      this.current_table_doc = null;
      this.remove_table_badge();
    }
    super.toggle_submitted_invoice_summary(show);
  }

  close_pos() {
    if (!this.frm && this.table_mode) {
      this.frm = { doc: { pos_profile: this.pos_profile, company: this.company } };
    }
    super.close_pos();
  }
}

awesome_restaurant3.RestaurantPosController = RestaurantPosController;
