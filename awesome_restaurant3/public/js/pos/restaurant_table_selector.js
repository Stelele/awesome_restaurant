awesome_restaurant3.TableSelector = class {
  constructor({ wrapper, table_count, table_drafts, events }) {
    this.wrapper = wrapper;
    this.table_count = table_count;
    this.table_drafts = table_drafts || {};
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
    for (let i = 1; i <= this.table_count; i++) {
      const table_name = __("Table") + " " + i;
      const draft = this.table_drafts[table_name];
      const is_occupied = !!draft;

      const status_class = is_occupied
        ? "pos-table-card--occupied"
        : "pos-table-card--free";

      const elapsed = draft?.modified
        ? this._format_elapsed(draft.modified)
        : "";

      const card_html = `
        <div class="pos-table-card ${status_class}" data-table="${i}">
          ${is_occupied ? '<span class="pos-table-card__clear">&times;</span>' : ""}
          <div class="pos-table-card__name">${table_name}</div>
          ${is_occupied
            ? `<div class="pos-table-card__total">${format_currency(draft.total, frappe.defaults.get_default("currency"))}</div>
               <div class="pos-table-card__meta">${draft.items} item${draft.items !== 1 ? "s" : ""}${elapsed ? " · " + elapsed : ""}</div>`
            : '<div class="pos-table-card__status">' + __("Free") + "</div>"
          }
        </div>`;

      const $card = $(card_html);
      $card.on("click", ".pos-table-card__clear", (e) => {
        e.stopPropagation();
        this._confirm_clear(table_name);
      });
      $card.on("click", (e) => {
        if (!$(e.target).is(".pos-table-card__clear")) {
          this.events.select_table(table_name);
        }
      });
      this.$grid.append($card);
    }
  }

  _confirm_clear(table_name) {
    const draft = this.table_drafts[table_name];
    if (!draft) return;

    frappe.confirm(
      __("Clear {0}? This will delete the draft invoice and free the table.", [table_name]),
      () => {
        this.events.clear_table(table_name);
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

  refresh(drafts) {
    this.table_drafts = drafts || this.table_drafts;
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
