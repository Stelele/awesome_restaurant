class KitchenDisplayController {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.$wrapper = $(wrapper);
		this.orders = [];
		this.active = true;
		this._fetching = false;
		this._marking_ready = new Set();
		this._refresh_timer = null;
		this._realtime_handler = null;
		this.make();
	}

	async make() {
		this.destroy();

		this.active = true;
		this.$wrapper.empty();

		this.$last_updated = $(`<div class="kitchen-last-updated"></div>`);
		this.$wrapper.append(this.$last_updated);

		this.$grid = $(`<div class="kitchen-order-grid"></div>`);
		this.$wrapper.append(this.$grid);

		this.queue = new awesome_restaurant3.OrderQueue({
			wrapper: this.$grid,
			events: {
				mark_ready: (invoice_name) => this.mark_ready(invoice_name),
			},
		});

		this.setup_realtime();
		await this.fetch_orders();
		this._start_refresh_timer();
	}

	_start_refresh_timer() {
		this._refresh_timer = setInterval(() => {
			if (!this.active) return;
			this.fetch_orders();
		}, 30000);
	}

	async fetch_orders() {
		if (this._fetching) return;
		this._fetching = true;
		try {
			const result = await frappe.call({
				method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.get_kitchen_orders",
			});
			if (!this.active) return;
			this.orders = result.message || [];
			this.queue.render(this.orders);
			this.update_last_updated();
		} catch (err) {
			frappe.show_alert({ message: __("Failed to load kitchen orders"), indicator: "red" });
		} finally {
			this._fetching = false;
		}
	}

	setup_realtime() {
		frappe.realtime.off("kitchen_order_update");
		this._realtime_handler = (data) => {
			if (!this.active) return;
			if (this._fetching) return;

			const idx = this.orders.findIndex((o) => o.name === data.invoice);

			if (data.should_remove) {
				if (idx !== -1) {
					this.orders.splice(idx, 1);
				}
			} else if (data.kitchen_status === "Received") {
				if (idx !== -1) {
					this.orders[idx] = { ...this.orders[idx], ...this._map_event(data) };
				} else {
					this.orders.push(this._map_event(data));
					this.play_new_order_sound();
				}
			}

			this.orders.sort((a, b) => {
				if (!a.sent_to_kitchen_at) return 1;
				if (!b.sent_to_kitchen_at) return -1;
				return new Date(a.sent_to_kitchen_at) - new Date(b.sent_to_kitchen_at);
			});

			this.queue.render(this.orders);
			this.update_last_updated();
		};
		frappe.realtime.on("kitchen_order_update", this._realtime_handler);
	}

	_map_event(data) {
		return {
			name: data.invoice,
			restaurant_table: data.restaurant_table,
			sent_to_kitchen_at: data.sent_to_kitchen_at,
			modified: data.modified,
			items: data.items || [],
		};
	}

	async mark_ready(invoice_name) {
		if (this._marking_ready.has(invoice_name)) return;
		this._marking_ready.add(invoice_name);

		const $btn = this.queue.$wrapper.find(`.kitchen-card__ready-btn[data-invoice="${CSS.escape(invoice_name)}"]`);
		$btn.prop("disabled", true).addClass("disabled");

		const confirmed = await new Promise((resolve) => {
			frappe.confirm(
				__("Mark this order as Ready?"),
				() => resolve(true),
				() => resolve(false),
			);
		});
		if (!confirmed) {
			this._marking_ready.delete(invoice_name);
			$btn.prop("disabled", false).removeClass("disabled");
			return;
		}

		try {
			await frappe.call({
				method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.mark_order_ready",
				args: { invoice_name },
			});
			if (!this.active) return;
			this.queue.mark_card_ready(invoice_name);
			frappe.show_alert({ message: __("Order marked Ready"), indicator: "green" });
		} catch (err) {
			if (!this.active) return;
			frappe.show_alert({ message: __("Failed to mark order ready"), indicator: "red" });
			$btn.prop("disabled", false).removeClass("disabled");
		} finally {
			this._marking_ready.delete(invoice_name);
		}
	}

	async play_new_order_sound() {
		if (this._last_sound && Date.now() - this._last_sound < 3000) return;
		this._last_sound = Date.now();

		try {
			if (!this._audio_ctx) {
				this._audio_ctx = new (window.AudioContext || window.webkitAudioContext)();
			}
			const ctx = this._audio_ctx;
			if (ctx.state === "suspended") {
				await ctx.resume();
			}

			const frequencies = [880, 1100, 1320];
			frequencies.forEach((freq, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = "sine";
				osc.frequency.value = freq;
				gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
				gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.start(ctx.currentTime + i * 0.15);
				osc.stop(ctx.currentTime + i * 0.15 + 0.5);
			});
		} catch (e) {
		}
	}

	update_last_updated() {
		const time = frappe.datetime.now_time();
		this.$last_updated.text(__("Last updated: {0}", [time]));
	}

	destroy() {
		this.active = false;
		if (this._refresh_timer) {
			clearInterval(this._refresh_timer);
			this._refresh_timer = null;
		}
		if (this._realtime_handler) {
			frappe.realtime.off("kitchen_order_update", this._realtime_handler);
			this._realtime_handler = null;
		}
		if (this._audio_ctx) {
			this._audio_ctx.close();
			this._audio_ctx = null;
		}
	}
}

awesome_restaurant3.KitchenDisplayController = KitchenDisplayController;
