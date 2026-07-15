const { defineConfig } = require("cypress");
const path = require("path");
const frappeConfig = require("../frappe/cypress.config");

module.exports = defineConfig({
    e2e: {
        ...frappeConfig.e2e,
        specPattern: ["./cypress/integration/*.js"],
    },
    viewportHeight: 960,
    viewportWidth: 1400,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 15000,
});
