frappe.listview_settings["POS Table"] = {
	refresh: function (listview) {
		listview.page.set_secondary_action(__("Bulk Create Tables"), function () {
			const dialog = new frappe.ui.Dialog({
				title: __("Bulk Create POS Tables"),
				fields: [
					{
						fieldname: "prefix",
						fieldtype: "Data",
						label: __("Name Prefix"),
						description: __("e.g. 'T' creates T1, T2, T3..."),
						reqd: 1,
					},
					{
						fieldname: "count",
						fieldtype: "Int",
						label: __("Number of Tables"),
						reqd: 1,
					},
					{
						fieldname: "status",
						fieldtype: "Select",
						label: __("Status"),
						options: "Free\nOccupied",
						default: "Free",
					},
					{
						fieldname: "profiles",
						fieldtype: "Table",
						label: __("Applicable POS Profiles"),
						cannot_add_rows: false,
						in_place_edit: true,
						data: [],
						fields: [
							{
								fieldname: "pos_profile",
								fieldtype: "Link",
								in_list_view: 1,
								label: __("POS Profile"),
								options: "POS Profile",
								reqd: 1,
							},
						],
					},
				],
				primary_action_label: __("Create Tables"),
				primary_action(values) {
					if (!values.prefix) {
						frappe.throw(__("Please enter a name prefix."));
						return;
					}
					if (!values.count || values.count < 1) {
						frappe.throw(__("Number of tables must be at least 1."));
						return;
					}
					frappe.call({
						method: "awesome_restaurant3.awesome_restaurant3.doctype.pos_table.pos_table.bulk_create_by_prefix",
						args: {
							prefix: values.prefix,
							count: values.count,
							status: values.status || "Free",
							profiles: JSON.stringify(values.profiles || []),
						},
						callback: function (r) {
							dialog.hide();
							listview.refresh();
							if (r.message.errors && r.message.errors.length) {
								frappe.show_alert({
									message: __("Created {0} of {1} tables.", [
										r.message.created.length,
										r.message.created.length + r.message.errors.length,
									]),
									indicator: "orange",
								});
							}
						},
					});
				},
			});
			dialog.show();
		});
	},
};
