app_name = "awesome_restaurant3"
app_title = "Awesome Restaurant3"
app_publisher = "Gift Mugweni"
app_description = "We try again"
app_email = "giftmugweni@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "awesome_restaurant3",
# 		"logo": "/assets/awesome_restaurant3/logo.png",
# 		"title": "Awesome Restaurant3",
# 		"route": "/awesome_restaurant3",
# 		"has_permission": "awesome_restaurant3.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = [
	"/assets/awesome_restaurant3/css/pos_table.css",
	"/assets/awesome_restaurant3/css/kitchen_display.css",
]
# app_include_js = "/assets/awesome_restaurant3/js/awesome_restaurant3.js"

# include js, css files in header of web template
# web_include_css = "/assets/awesome_restaurant3/css/awesome_restaurant3.css"
# web_include_js = "/assets/awesome_restaurant3/js/awesome_restaurant3.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "awesome_restaurant3/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
page_js = {
	"point-of-sale": "public/js/pos/restaurant_pos.js",
	"kitchen-display": "public/js/kitchen/kitchen_display.js",
}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "awesome_restaurant3/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "awesome_restaurant3.utils.jinja_methods",
# 	"filters": "awesome_restaurant3.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "awesome_restaurant3.install.before_install"
# after_install = "awesome_restaurant3.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "awesome_restaurant3.uninstall.before_uninstall"
# after_uninstall = "awesome_restaurant3.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "awesome_restaurant3.utils.before_app_install"
# after_app_install = "awesome_restaurant3.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "awesome_restaurant3.utils.before_app_uninstall"
# after_app_uninstall = "awesome_restaurant3.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "awesome_restaurant3.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "awesome_restaurant3.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Custom Fields
# -------------
custom_fields = {
	"POS Invoice": [
		{
			"fieldname": "restaurant_table",
			"label": "Restaurant Table",
			"fieldtype": "Data",
			"insert_after": "pos_profile",
		},
		{
			"fieldname": "kitchen_status",
			"label": "Kitchen Status",
			"fieldtype": "Select",
			"options": "\nReceived\nReady",
			"insert_after": "restaurant_table",
			"allow_on_submit": 1,
			"read_only": 1,
		},
		{
			"fieldname": "sent_to_kitchen_at",
			"label": "Sent to Kitchen At",
			"fieldtype": "Datetime",
			"insert_after": "kitchen_status",
			"allow_on_submit": 1,
			"read_only": 1,
		},
	],
	"POS Invoice Item": [
		{
			"fieldname": "sent_to_kitchen_at",
			"label": "Sent to Kitchen At",
			"fieldtype": "Datetime",
			"allow_on_submit": 1,
			"read_only": 1,
		},
	],
	"Sales Invoice": [
		{
			"fieldname": "restaurant_table",
			"label": "Restaurant Table",
			"fieldtype": "Data",
			"insert_after": "pos_profile",
		}
	],
}

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"POS Closing Entry": {
		"on_submit": "awesome_restaurant3.awesome_restaurant3.pos_table_utils.free_tables_if_all_sessions_closed"
	},
	"POS Table": {
		"on_update": "awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_table_update"
	},
	"POS Invoice": {
		"on_update": "awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_kitchen_update"
	},
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"awesome_restaurant3.tasks.all"
# 	],
# 	"daily": [
# 		"awesome_restaurant3.tasks.daily"
# 	],
# 	"hourly": [
# 		"awesome_restaurant3.tasks.hourly"
# 	],
# 	"weekly": [
# 		"awesome_restaurant3.tasks.weekly"
# 	],
# 	"monthly": [
# 		"awesome_restaurant3.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "awesome_restaurant3.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "awesome_restaurant3.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "awesome_restaurant3.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "awesome_restaurant3.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["awesome_restaurant3.utils.before_request"]
# after_request = ["awesome_restaurant3.utils.after_request"]

# Job Events
# ----------
# before_job = ["awesome_restaurant3.utils.before_job"]
# after_job = ["awesome_restaurant3.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"awesome_restaurant3.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

