/*
 * Main Javascript file for app.
 *
 * This file bundles all of your javascript together using webpack.
 */

// JavaScript modules
require("jquery");
require("bootstrap");


require.context(
  "../img", // context folder
  true, // include subdirectories
  /.*/, // RegExp
);

// Your own code
require("./theme-toggle");
