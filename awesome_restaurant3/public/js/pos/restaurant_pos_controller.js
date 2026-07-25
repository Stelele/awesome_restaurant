class RestaurantPosController extends erpnext.PointOfSale.Controller {
  async make_app() {
    this.prepare_dom();
    this.prepare_components();
    this.prepare_menu();
    this.prepare_btns();

    const tables = await frappe.db.get_list("POS Table", {
      filters: [["POS Table Profile", "pos_profile", "=", this.pos_profile]],
      fields: ["name"],
    });
    if (tables.length > 0) {
      this.table_mode = true;
      await this.load_table_grid();
    } else {
      await this.make_new_invoice();
    }
  }

  init_item_cart() {
    super.init_item_cart();
    this.cart.events.get_frm = () => this.frm || { doc: { items: [], currency: "" } };
    this.cart.events.cart_item_clicked = (item) => {
      if (this._is_order_locked()) return;
      const item_row = this.get_item_from_frm(item);
      this.item_details.toggle_item_details_section(item_row);
    };
    const orig_edit_cart = this.cart.events.edit_cart;
    this.cart.events.edit_cart = () => {
      orig_edit_cart();
      if (this._is_order_locked()) {
        setTimeout(() => this.cart.disable_customer_selection(), 0);
      }
    };
    this._init_tip_ui();
  }

  _init_tip_ui() {
    const $totals = this.cart.$totals_section;
    if (!$totals.length || $totals.find(".add-tip-wrapper").length) return;

    this._tip_item_code = null;

    $totals.find(".add-discount-wrapper").after(
      `<div class="add-tip-wrapper" style="display:flex;align-items:center;gap:6px;padding:var(--padding-sm) var(--padding-md);border:1px dashed var(--gray-500);border-radius:var(--border-radius-md);cursor:pointer;margin-bottom:4px">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        ${__("Add Tip")}
      </div>
      <div class="tip-amount-container" style="display:none;justify-content:space-between;padding:var(--padding-sm) var(--padding-md)">
        <div>${__("Tip")}</div>
        <div class="tip-amount-value">0.00</div>
      </div>`
    );

    this.cart.$add_tip_elem = $totals.find(".add-tip-wrapper");
    this.cart.$tip_amount_elem = $totals.find(".tip-amount-container");
    this.cart.$tip_amount_value_elem = $totals.find(".tip-amount-value");

    $totals.on("click", ".add-tip-wrapper", () => {
      this._show_tip_dialog();
    });

    if (!this.cart._orig_update_item_html) {
      this.cart._orig_update_item_html = this.cart.update_item_html.bind(this.cart);
      this.cart.update_item_html = (item, remove_item) => {
        this.cart._orig_update_item_html(item, remove_item);
        const code = this._get_tip_item_code();
        if (!code) return;
        const $row = this.cart.get_cart_item(item);
        if ($row.length) {
          const item_row = this.cart.get_item_from_frm(item);
          if (item_row && item_row.item_code === code) {
            $row.addClass("tip-item");
          } else {
            $row.removeClass("tip-item");
          }
        }
      };
    }
  }

  _get_tip_item_code() {
    return this._tip_item_code;
  }

  _load_tip_item_code() {
    if (!this.frm || !this.frm.doc || !this.frm.doc.pos_profile) return;
    frappe.xcall("awesome_restaurant3.awesome_restaurant3.pos_table_utils.get_tip_item_code", {
      pos_profile: this.frm.doc.pos_profile,
    }).then((code) => {
      if (code) {
        this._tip_item_code = code;
        this._sync_tip_display();
      }
    });
  }

  _get_existing_tip_item() {
    const code = this._get_tip_item_code();
    if (!code || !this.frm) return null;
    return (this.frm.doc.items || []).find((i) => i.item_code === code);
  }

  _show_tip_dialog() {
    const me = this;
    const currency = this.frm ? this.frm.doc.currency : frappe.sys_defaults.currency;
    const precision = 2;

    const existing = this._get_existing_tip_item();
    const existing_amount = existing ? existing.rate : 0;

    let numpad_value = existing_amount > 0
      ? (existing_amount * (10 ** precision)).toFixed(0)
      : "";

    const dialog = new frappe.ui.Dialog({
      title: __("Add Tip"),
      size: "small",
      primary_action_label: __("Done"),
      primary_action() {
        const amount = parseFloat(numpad_value || "0") / (10 ** precision);
        me._add_tip_to_cart(amount);
        this.hide();
      },
    });

    dialog.$wrapper.addClass("tip-dialog");

    const $body = dialog.$body;
    $body.html(`
      <div class="tip-dialog-display" style="text-align:center;padding:24px 0 16px">
        <div class="tip-dialog-amount" style="font-size:36px;font-weight:700;color:var(--text-color)">
          ${format_currency(0, currency)}
        </div>
      </div>
      <div class="tip-dialog-numpad"></div>
    `);

    const $display = $body.find(".tip-dialog-amount");
    const $numpad_wrapper = $body.find(".tip-dialog-numpad");

    const update_display = () => {
      const val = parseFloat(numpad_value || "0") / (10 ** precision);
      $display.text(format_currency(val, currency));
    };

    const numpad = new erpnext.PointOfSale.NumberPad({
      wrapper: $numpad_wrapper,
      events: {
        numpad_event($btn) {
          const btn_val = $btn.attr("data-button-value");
          if (btn_val === "delete" || btn_val === "Backspace") {
            numpad_value = numpad_value.slice(0, -1);
          } else if (btn_val === ".") {
            if (!numpad_value.includes(".")) {
              numpad_value = numpad_value || "0";
              numpad_value += ".";
            }
          } else if (!isNaN(btn_val)) {
            numpad_value += String(btn_val);
          }
          update_display();
        },
      },
      cols: 3,
      keys: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [".", 0, "Delete"],
      ],
    });

    dialog.show();
    update_display();

    $(document).on("keydown.tip_dialog", (e) => {
      const key = e.key;
      if (key === "Enter") {
        e.preventDefault();
        dialog.get_primary_btn().trigger("click");
        return;
      }
      if (key === "Escape") {
        dialog.hide();
        return;
      }
      if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        numpad_value = numpad_value.slice(0, -1);
        update_display();
        return;
      }
      if (key === ".") {
        e.preventDefault();
        if (!numpad_value.includes(".")) {
          numpad_value = numpad_value || "0";
          numpad_value += ".";
        }
        update_display();
        return;
      }
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        numpad_value += key;
        update_display();
        return;
      }
    });

    dialog.$wrapper.on("hidden.bs.modal", () => {
      $(document).off("keydown.tip_dialog");
    });
  }

  _add_tip_to_cart(amount) {
    if (!this.frm) return;
    amount = flt(amount);
    const tip_item_code = this._get_tip_item_code();

    if (!tip_item_code) {
      frappe.show_alert({
        message: __("Tip item not configured in POS Profile. Please set 'Tip Item' in the profile."),
        indicator: "orange",
      });
      return;
    }

    const existing = this._get_existing_tip_item();

    if (amount <= 0) {
      if (existing) {
        this._remove_tip(existing);
      }
      return;
    }

    frappe.dom.freeze();

    const frm = this.frm;

    if (existing) {
      frappe.model.set_value(existing.doctype, existing.name, "rate", amount).then(() => {
        frm.trigger("change");
        this._update_tip_display(amount);
        frappe.dom.unfreeze();
      });
    } else {
      const item_row = frm.add_child("items", {
        qty: 1,
        warehouse: this.settings?.warehouse,
        use_serial_batch_fields: 1,
      });
      frappe.model.set_value(item_row.doctype, item_row.name, "item_code", tip_item_code).then(() => {
        return frappe.model.set_value(item_row.doctype, item_row.name, "item_name", "Tip");
      }).then(() => {
        return frappe.model.set_value(item_row.doctype, item_row.name, "rate", amount);
      }).then(() => {
        frm.trigger("change");
        this._update_tip_display(amount);
        frappe.dom.unfreeze();
      });
    }
  }

  _remove_tip(existing) {
    if (!existing || !this.frm) return;
    frappe.dom.freeze();
    frappe.model.delete_doc(existing.doctype, existing.name, () => {
      this.frm.trigger("change");
      this._update_tip_display(0);
      frappe.dom.unfreeze();
    });
  }

  _update_tip_display(amount) {
    amount = flt(amount);
    if (this.frm) {
      this.frm.set_value("custom_tip_amount", amount);
    }
    if (this.cart && this.cart.$tip_amount_elem) {
      const currency = this.frm ? this.frm.doc.currency : frappe.sys_defaults.currency;
      if (amount > 0) {
        this.cart.$tip_amount_elem.css("display", "flex");
        this.cart.$tip_amount_value_elem.text(format_currency(amount, currency));
        this.cart.$add_tip_elem.css("display", "flex").html(
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          ${__("Edit Tip")}`
        );
      } else {
        this.cart.$tip_amount_elem.css("display", "none");
        this.cart.$add_tip_elem.css("display", "flex").html(
          `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          ${__("Add Tip")}`
        );
      }
    }
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
        item_selected: (args) => {
          if (this._is_order_locked()) {
            frappe.show_alert({
              message: __("Order is ready for payment. Cannot modify items."),
              indicator: "orange",
            });
            return;
          }
          this.on_cart_update(args);
        },
        get_frm: () => this.frm || { doc: {} },
      },
    });
    if (this.settings?.selling_price_list) {
      this.item_selector.price_list = this.settings.selling_price_list;
    }
  }

  init_payments() {
    super.init_payments();
    const orig_toggle = this.payment.events.toggle_other_sections;
    this.payment.events.toggle_other_sections = (show) => {
      orig_toggle(show);
      if (this._is_order_locked()) {
        const $cc = this.cart.$component.closest(".customer-cart-container");
        const $row = this.cart.$totals_section.find(".action-btns-row");
        if (show) {
          $cc.css({ "grid-column": "", "width": "" });
          $row.hide();
        } else {
          this.item_selector.toggle_component(false);
          this.cart.disable_customer_selection();
          $cc.css({ "grid-column": "3 / 9", "width": "100%" });
          $row.show();
        }
      }
    };
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

  _is_order_locked() {
    return this.current_table_doc?._kitchen_status === "Ready";
  }

  _apply_ready_lock() {
    if (this.item_selector) {
      this.item_selector.toggle_component(false);
    }
    if (this.cart) {
      this.cart.toggle_numpad(false);
      this.cart.$component.addClass("pos-order-locked");
      this.cart.$component.closest(".customer-cart-container").css({
        "grid-column": "3 / 9",
        "width": "100%",
      });
      this.cart.disable_customer_selection();
      this._add_print_bill_button();
      if (!this.cart._orig_update_customer_section) {
        this.cart._orig_update_customer_section = this.cart.update_customer_section.bind(this.cart);
        this.cart.update_customer_section = () => {
          this.cart._orig_update_customer_section();
          if (this._is_order_locked()) {
            this.cart.disable_customer_selection();
          }
        };
      }
      if (!this.cart._orig_highlight_checkout_btn) {
        this.cart._orig_highlight_checkout_btn = this.cart.highlight_checkout_btn.bind(this.cart);
        this.cart.highlight_checkout_btn = (toggle) => {
          this.cart._orig_highlight_checkout_btn(toggle);
          if (this.cart.$add_tip_elem) {
            this.cart.$add_tip_elem.css("display", toggle ? "flex" : "none");
          }
        };
      }
    }
  }

  _remove_ready_lock() {
    if (this.cart) {
      this.cart.$component.removeClass("pos-order-locked");
      this.cart.$component.closest(".customer-cart-container").css({
        "grid-column": "",
        "width": "",
      });
      this._remove_print_bill_button();
      if (this.cart._orig_update_customer_section) {
        this.cart.update_customer_section = this.cart._orig_update_customer_section;
        this.cart._orig_update_customer_section = null;
      }
      if (this.cart._orig_highlight_checkout_btn) {
        this.cart.highlight_checkout_btn = this.cart._orig_highlight_checkout_btn;
        this.cart._orig_highlight_checkout_btn = null;
      }
      this._sync_tip_display();
    }
  }

  _add_print_bill_button() {
    const $totals = this.cart.$totals_section;
    if ($totals.find(".print-bill-btn").length) return;
    const $checkout = $totals.find(".checkout-btn");
    if (!$checkout.length) return;
    const $printBtn = $(`<div class="print-bill-btn primary-action">
      <svg class="icon icon-md"><use href="#icon-printer"></use></svg>Print Bill
    </div>`).on("click", () => {
      if (!this.frm) return;
      const params = new URLSearchParams({
        doctype: this.frm.doc.doctype,
        name: this.frm.doc.name,
        format: this.frm.pos_print_format || "",
        no_letterhead: this.frm.doc.letter_head ? "0" : "1",
        _lang: this.frm.doc.language || frappe.boot.lang,
      });
      if (this.frm.doc.letter_head) {
        params.set("letterhead", this.frm.doc.letter_head);
      }
      const $iframe = $("<iframe>", {
        src: "/printview?" + params.toString(),
        style: "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none",
      });
      $iframe.on("load", function () {
        setTimeout(() => {
          try { this.contentWindow.print(); } catch (e) {}
        }, 500);
        setTimeout(() => $iframe.remove(), 30000);
      });
      $(document.body).append($iframe);
    });
    const $row = $('<div class="action-btns-row"></div>');
    $checkout.before($row);
    $checkout.addClass("primary-action");
    $row.append($printBtn, $checkout);
  }

  _remove_print_bill_button() {
    const $row = this.cart.$totals_section.find(".action-btns-row");
    if (!$row.length) return;
    const $checkout = $row.find(".checkout-btn");
    $checkout.removeClass("primary-action");
    $row.before($checkout);
    $row.remove();
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
      const ks = kstatus?.message?.kitchen_status || "";
      this.current_table_doc._kitchen_status = ks;
      if (ks === "Received" || ks === "Ready") {
        this.current_table_doc._kitchen_sent = true;
      }
    }

    this.table_selector.hide();
    this.render_table_badge();

    if (table.status === "Occupied" && table.current_invoice && table.current_invoice_doctype) {
      const exists = await frappe.db.exists(table.current_invoice_doctype, table.current_invoice);
      if (exists) {
        await this.edit_table_draft(table.current_invoice, table.current_invoice_doctype, table_number);
        if (this._is_order_locked()) {
          this._apply_ready_lock();
        }
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
          () => {
            this._load_tip_item_code();
            this.toggle_components(true);
          },
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
      this._remove_ready_lock();
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
      this._load_tip_item_code();
    });
  }

  new_invoice_event() {
    if (this.table_mode) {
      this.go_back_to_tables();
      return;
    }
    super.new_invoice_event();
  }

  _sync_tip_display() {
    if (!this.frm || !this.cart) return;
    const tip = this._get_existing_tip_item();
    const amount = tip ? flt(tip.rate) : 0;
    this._update_tip_display(amount);
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
    this._remove_ready_lock();
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
    const is_ready = this.current_table_doc?._kitchen_status === "Ready";
    let action_html;
    if (is_ready) {
      action_html = `<span class="pos-table-badge__sent-label pos-table-badge__sent-label--ready">${__("Order Ready")}</span>`;
    } else if (already_sent) {
      action_html = `<span class="pos-table-badge__sent-label">${__("Order Sent")}</span>`;
    } else {
      action_html = `<button class="btn btn-primary btn-sm pos-table-badge__send-btn" id="pos-send-kitchen-btn" style="margin-left:auto;background-color:#2490ef;color:#fff">${__("Send to Kitchen")}</button>`;
    }
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
        this.current_table_doc._kitchen_status = "Received";
        this.render_table_badge();
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
      this._remove_ready_lock();
      this.current_table_doc = null;
      this.remove_table_badge();
    }
    super.toggle_submitted_invoice_summary(show);
  }

  async on_cart_update(args) {
    if (this._is_order_locked()) {
      frappe.show_alert({
        message: __("Order is ready for payment. Cannot modify items."),
        indicator: "orange",
      });
      return;
    }
    if (super.on_cart_update) {
      await super.on_cart_update(args);
    }
    this._reset_kitchen_sent();
  }

  remove_item_from_cart() {
    if (this._is_order_locked()) {
      frappe.show_alert({
        message: __("Order is ready for payment. Cannot modify items."),
        indicator: "orange",
      });
      return;
    }
    const current = this.item_details?.current_item;
    const was_tip = current && current.item_code === this._get_tip_item_code();
    if (super.remove_item_from_cart) {
      super.remove_item_from_cart();
    }
    if (was_tip) {
      this._update_tip_display(0);
      this._tip_item_code = null;
    }
    this._reset_kitchen_sent();
  }

  _reset_kitchen_sent() {
    if (this.current_table_doc?._kitchen_sent) {
      this.current_table_doc._kitchen_sent = false;
      this.render_table_badge();
    }
  }

  close_pos() {
    if (!this.frm && this.table_mode) {
      this.frm = { doc: { pos_profile: this.pos_profile, company: this.company } };
    }
    super.close_pos();
  }
}

awesome_restaurant3.RestaurantPosController = RestaurantPosController;
