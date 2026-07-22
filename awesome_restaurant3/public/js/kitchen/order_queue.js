awesome_restaurant3.OrderQueue = class {
	constructor({ wrapper, events }) {
		this.wrapper = wrapper;
		this.events = events;
		this.$wrapper = $(this.wrapper);
		this._setup_delegation();
	}

	_setup_delegation() {
		this.$wrapper.on("click", ".kitchen-card__ready-btn", (e) => {
			const invoice_name = $(e.currentTarget).data("invoice");
			if (invoice_name) {
				this.events.mark_ready(invoice_name);
			}
		});
	}

	render(orders) {
		this.$wrapper.empty();
		if (!orders || orders.length === 0) {
			this.$wrapper.html(
				`<div class="kitchen-empty">${__("No active orders")}</div>`
			);
			return;
		}

		orders.forEach((order) => {
			this.$wrapper.append(this._render_card(order));
		});
	}

	_render_card(order) {
		const elapsed_text = this._format_elapsed(order.sent_to_kitchen_at);
		const mins = this._minutes_since(order.sent_to_kitchen_at);
		const is_new = mins <= 5;
		const is_late = mins > 20;

		const badge_class = is_new
			? "kitchen-card--new"
			: is_late
				? "kitchen-card--late"
				: "kitchen-card--received";

		const status_label = is_new
			? __("NEW")
			: is_late
				? __("LATE")
				: __("RECEIVED");

		const items_html = (order.items || [])
			.map((item) => `
				<div class="kitchen-item">
					<span class="kitchen-item__name">${frappe.utils.escape_html(item.item_name)}</span>
					<span class="kitchen-item__qty">x${item.qty}</span>
				</div>
			`)
			.join("");

		const modified_badge = order.has_been_modified
			? `<span class="kitchen-card__badge kitchen-card__badge--modified">${__("Modified")}</span>`
			: "";

		return `
			<div class="kitchen-card ${badge_class}" data-invoice="${CSS.escape(order.name)}">
				<div class="kitchen-card__header">
					<div class="kitchen-card__table">${frappe.utils.escape_html(order.restaurant_table)}</div>
					<div class="kitchen-card__badges">
						${modified_badge}
						<span class="kitchen-card__badge kitchen-card__badge--status">${status_label}</span>
					</div>
				</div>
				<div class="kitchen-card__items">${items_html}</div>
				<div class="kitchen-card__footer">
					<span class="kitchen-card__elapsed">${elapsed_text}</span>
					<button class="kitchen-card__ready-btn" data-invoice="${order.name}">
						${__("Ready")}
					</button>
				</div>
			</div>
		`;
	}

	mark_card_ready(invoice_name) {
		const $card = this.$wrapper.find(`.kitchen-card[data-invoice="${CSS.escape(invoice_name)}"]`);
		if (!$card.length) return;

		$card.removeClass("kitchen-card--new kitchen-card--received kitchen-card--late")
			.addClass("kitchen-card--ready");
		$card.find(".kitchen-card__badge--status").text(__("READY")).addClass("kitchen-card__badge--ready");
		$card.find(".kitchen-card__ready-btn").remove();
	}

	_minutes_since(datetime_str) {
		if (!datetime_str) return Infinity;
		return moment().diff(moment(datetime_str), "minutes");
	}

	_format_elapsed(datetime_str) {
		if (!datetime_str) return __("just now");
		const mins = this._minutes_since(datetime_str);
		if (mins < 1) return __("just now");
		if (mins < 60) return __("{0}m ago", [mins]);
		const hours = Math.floor(mins / 60);
		return __("{0}h {1}m ago", [hours, mins % 60]);
	}
};
