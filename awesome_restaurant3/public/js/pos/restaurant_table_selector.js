awesome_restaurant3.TableSelector = class {
  constructor({ wrapper, tables, events }) {
    this.wrapper = wrapper;
    this.tables = tables || [];
    this.events = events;

    this.make();
  }

  make() {
    this.$component = $(
      `<div class="pos-table-grid-wrapper"><div class="pos-table-grid"></div></div>`
    ).appendTo(this.wrapper);

    this.$grid = this.$component.find(".pos-table-grid");
    this.render_grid();
  }

  render_grid() {
    this.$grid.empty();
    this.$card_map = {};

    this.tables.forEach((table) => {
      const table_number = table.table_number;
      const is_occupied = table.status === "Occupied";

      const status_class = is_occupied
        ? "pos-table-card--occupied"
        : "pos-table-card--free";

      const elapsed = table.modified
        ? this._format_elapsed(table.modified)
        : "";

      const card_html = `
        <div class="pos-table-card ${status_class}" data-table="${table_number}">
          ${is_occupied ? '<span class="pos-table-card__clear">&times;</span>' : ""}
          <div class="pos-table-card__name">${table_number}</div>
          ${is_occupied
            ? `<div class="pos-table-card__meta">
                 ${elapsed ? elapsed : __("Occupied")}
               </div>`
            : '<div class="pos-table-card__status">' + __("Free") + "</div>"
          }
        </div>`;

      const $card = $(card_html);
      $card.on("click", ".pos-table-card__clear", (e) => {
        e.stopPropagation();
        this._confirm_clear(table_number);
      });
      $card.on("click", (e) => {
        if (!$(e.target).is(".pos-table-card__clear")) {
          this.events.select_table(table_number);
        }
      });
      this.$grid.append($card);
      this.$card_map[table_number] = $card;
    });
  }

  update_table(data) {
    const $card = this.$card_map[data.table_number];
    if (!$card) return;

    const is_occupied = data.status === "Occupied";
    $card.removeClass("pos-table-card--free pos-table-card--occupied");
    $card.addClass(is_occupied ? "pos-table-card--occupied" : "pos-table-card--free");

    const clear_btn = $card.find(".pos-table-card__clear");
    if (is_occupied && !clear_btn.length) {
      $card.prepend('<span class="pos-table-card__clear">&times;</span>');
      $card.find(".pos-table-card__clear").on("click", (e) => {
        e.stopPropagation();
        this._confirm_clear(data.table_number);
      });
    } else if (!is_occupied) {
      clear_btn.remove();
    }

    const meta_el = $card.find(".pos-table-card__meta");
    const status_el = $card.find(".pos-table-card__status");
    if (is_occupied) {
      status_el.remove();
      if (!meta_el.length) {
        $card.find(".pos-table-card__name").after(
          `<div class="pos-table-card__meta">${__("Occupied")}</div>`
        );
      }
    } else {
      meta_el.remove();
      if (!status_el.length) {
        $card.find(".pos-table-card__name").after(
          '<div class="pos-table-card__status">' + __("Free") + "</div>"
        );
      }
    }
  }

  _confirm_clear(table_number) {
    const table = this.tables.find((t) => t.table_number === table_number);
    if (!table || table.status !== "Occupied") return;

    frappe.confirm(
      __("Clear {0}? This will delete the draft invoice and free the table.", [table_number]),
      () => {
        this.events.clear_table(table_number);
      }
    );
  }

  _format_elapsed(modified_str) {
    const now = moment();
    const then = moment(modified_str);
    const mins = now.diff(then, "minutes");
    if (mins < 1) return __("just now");
    if (mins < 60) return __("{0}m ago", [mins]);
    const hours = Math.floor(mins / 60);
    return __("{0}h ago", [hours]);
  }

  refresh(tables) {
    this.tables = tables || this.tables;
    this.render_grid();
  }

  show() {
    this.$component.show();
  }

  hide() {
    this.$component.hide();
  }

  toggle_component(show) {
    this.$component.toggle(show);
  }
};
