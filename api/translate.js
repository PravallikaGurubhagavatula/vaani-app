const { handleTranslate } = require("../server/translate.js");

module.exports = async function translateHandler(req, res) {
  return handleTranslate(req, res);
};
