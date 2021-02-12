/**
 * Copyright 2020 Open Reaction Database Project Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.module('ord.products');
goog.module.declareLegacyNamespace();
exports = {
  load,
  unload,
  add,
  addMeasurement,
  validateProduct,
  validateMeasurement
};

goog.require('ord.amounts');
goog.require('ord.compounds');
goog.require('ord.utils');
goog.require('proto.ord.FloatValue');
goog.require('proto.ord.Percentage');
goog.require('proto.ord.ProductCompound.Texture');
goog.require('proto.ord.ProductMeasurement');
goog.require('proto.ord.ProductMeasurement.MassSpecMeasurementDetails');
goog.require('proto.ord.ProductMeasurement.Selectivity');
goog.require('proto.ord.ProductCompound');
goog.require('proto.ord.Time');
goog.require('proto.ord.Wavelength');

// Freely create radio button groups by generating new input names.
let radioGroupCounter = 0;

/**
 * Adds and populates the products section of the form.
 * @param {!Node} node The target node for the product divs.
 * @param {!Array<!proto.ord.ProductCompound>} products
 */
function load(node, products) {
  products.forEach(product => loadProduct(node, product));
}

/**
 * Adds and populates a product section in the form.
 * @param {!Node} outcomeNode The parent ReactionOutcome node.
 * @param {!proto.ord.ProductCompound} product
 */
function loadProduct(outcomeNode, product) {
  const node = add(outcomeNode);

  const reactionRole = product.getReactionRole();
  ord.utils.setSelector($('.component_reaction_role', node), reactionRole);

  const identifiers = product.getIdentifiersList();
  identifiers.forEach(identifier => {
    ord.compounds.loadIdentifier(node, identifier);
  });

  ord.utils.setOptionalBool(
      $('.outcome_product_desired', node),
      product.hasIsDesiredProduct() ? product.getIsDesiredProduct() : null);
  product.getMeasurementsList().forEach(
      measurement => loadMeasurement(node, measurement));
  $('.outcome_product_color', node).text(product.getIsolatedColor());
  const texture = product.getTexture();
  if (texture) {
    ord.utils.setSelector(
        $('.outcome_product_texture_type', node), texture.getType());
    $('.outcome_product_texture_details', node).text(texture.getDetails());
  }
  const features = product.getFeaturesMap();
  features.forEach(function(feature, name) {
    const featureNode = ord.compounds.addFeature(node);
    ord.compounds.loadFeature(featureNode, name, feature);
  });
}

/**
 * Fetches the products defined in the form.
 * @param {!Node} node The parent ReactionOutcome node.
 * @return {!Array<!proto.ord.ProductCompound>}
 */
function unload(node) {
  const products = [];
  $('.outcome_product', node).each(function(index, productNode) {
    productNode = $(productNode);
    if (!productNode.attr('id')) {
      // Not a template.
      const product = unloadProduct(productNode);
      if (!ord.utils.isEmptyMessage(product)) {
        products.push(product);
      }
    }
  });
  return products;
}

/**
 * Fetches a product defined in the form.
 * @param {!Node} node An element containing a product.
 * @return {!proto.ord.ProductCompound}
 */
function unloadProduct(node) {
  const product = new proto.ord.ProductCompound();

  const reactionRole =
      ord.utils.getSelector($('.component_reaction_role', node));
  product.setReactionRole(reactionRole);

  const identifiers =
      ord.compounds.unloadIdentifiers($('.product_compound_identifiers', node));

  if (identifiers.some(e => !ord.utils.isEmptyMessage(e))) {
    product.setIdentifiersList(identifiers);
  }

  product.setIsDesiredProduct(
      ord.utils.getOptionalBool($('.outcome_product_desired', node)));

  const measurements = [];
  $('.product_measurement', node).each(function(index, measurementNode) {
    measurementNode = $(measurementNode);
    if (!measurementNode.attr('id')) {
      // Not a template.
      const measurement = unloadMeasurement(measurementNode);
      if (!ord.utils.isEmptyMessage(measurement)) {
        measurements.push(measurement);
      }
    }
  });
  product.setMeasurementsList(measurements);

  const color = $('.outcome_product_color', node).text();
  product.setIsolatedColor(color);

  const texture = new proto.ord.ProductCompound.Texture();
  texture.setType(
      ord.utils.getSelector($('.outcome_product_texture_type', node)));
  texture.setDetails($('.outcome_product_texture_details', node).text());
  if (!ord.utils.isEmptyMessage(texture)) {
    product.setTexture(texture);
  }

  const featuresMap = product.getFeaturesMap();
  $('.feature', node).each(function(index, featureNode) {
    featureNode = $(featureNode);
    if (!featureNode.attr('id')) {
      ord.compounds.unloadFeature(featureNode, featuresMap);
    }
  });

  return product;
}

/**
 * Fetches the set of Analysis keys.
 * @param {!Node} node The parent ReactionOutcome div.
 * @param {string} tag Analysis target, e.g. "identities", "yields", etc.
 * @return {!Array<string>}
 */
function unloadAnalysisKeys(node, tag) {
  const values = [];
  $('.outcome_product_analysis_' + tag, node).each(function(index, tagNode) {
    tagNode = $(tagNode);
    if (!tagNode.attr('id')) {
      // Not a template.
      const value = $('.analysis_key_selector', tagNode).val();
      if (value != '') {
        values.push(value);
      }
    }
  });
  return values;
}

/**
 * Adds a reaction product section to the form.
 * @param {!Node} node Target ReactionOutcome node for the new product.
 * @return {!Node} The newly created node.
 */
function add(node) {
  const productNode = ord.utils.addSlowly(
      '#outcome_product_template', $('.outcome_products', node));
  ord.amounts.init(node);

  // Connect reaction role selection to is_desired_product.
  const roleSelector = $('.component_reaction_role', node);
  roleSelector.change(function() {
    if (ord.utils.getSelectorText(this) === 'PRODUCT') {
      $('.is_desired_product', node).show();
    } else {
      $('.is_desired_product', node).hide();
    }
  });
  roleSelector.trigger('change');

  // Add live validation handling.
  ord.utils.addChangeHandler(productNode, () => {
    validateProduct(productNode);
  });
  return productNode;
}

/**
 * Adds keys for defined analyses to the analysis selector.
 * @param {!Node} node Parent node containing ReactionOutcome data.
 * @param {!Node} analysisSelectorNode Node containing an analysis selector.
 */
function populateAnalysisSelector(node, analysisSelectorNode) {
  const outcomeNode = node.closest('.outcome');
  $('.outcome_analysis_name', outcomeNode).each(function() {
    const name = $(this).text();
    if (name) {
      $('.analysis_key_selector', analysisSelectorNode)
          .append('<option value="' + name + '">' + name + '</option>');
    }
  });
}

/**
 * Adds a ProductMeasurement section to the form.
 * @param {!Node} node Parent node for the ProductCompound.
 * @return {!Node} The newly created node.
 */
function addMeasurement(node) {
  const measurementNode = ord.utils.addSlowly(
      '#product_measurement_template',
      $('.product_measurement_repeated', node));
  populateAnalysisSelector(
      node, $('.product_measurement_analysis_key', measurementNode));

  // Set up the radio buttons for the value type.
  const buttons = $('.product_measurement_value_type input', measurementNode);
  buttons.attr('name', 'product_measurements_' + radioGroupCounter++);
  buttons.change(function() {
    if (this.value === 'string') {
      $('.product_measurement_pm', measurementNode).hide();
      $('.product_measurement_precision', measurementNode).hide();
    } else {
      $('.product_measurement_pm', measurementNode).show();
      $('.product_measurement_precision', measurementNode).show();
    }
    if (this.value === 'mass') {
      $('.amount_units_mass', measurementNode).show();
    } else {
      $('.amount_units_mass', measurementNode).hide();
    }
  });

  // Add an empty compound node for the authentic standard.
  const authenticStandard = ord.compounds.add(measurementNode);
  const title = $('.h4', authenticStandard);
  title.text('Authentic Standard');
  // Remove the "amount" section from the authentic standard.
  $('.amount', authenticStandard).hide();
  // Adjust the heading sizes.
  $('.h4', authenticStandard).addClass('h7').removeClass('h4');
  $('.h5', authenticStandard).addClass('h8').removeClass('h5');

  // Show/hide the authentic standard based on the optional bool.
  const usesAuthenticStandard =
      $('.product_measurement_uses_authentic_standard', measurementNode);
  usesAuthenticStandard.change(function() {
    if (ord.utils.getOptionalBool(usesAuthenticStandard)) {
      $('.product_measurement_authentic_standard', measurementNode).show();
    } else {
      $('.product_measurement_authentic_standard', measurementNode).hide();
    }
  });
  usesAuthenticStandard.trigger('change');

  // Add live validation handling.
  ord.utils.addChangeHandler(measurementNode, () => {
    validateMeasurement(measurementNode);
  });

  // Show/hide fields based on the measurement type.
  const measurementTypeSelector =
      $('.product_measurement_type select', measurementNode);
  measurementTypeSelector.change(function() {
    const measurementType = this.options[this.selectedIndex].text;
    if (measurementType === 'UNSPECIFIED') {
      $('.product_measurement_value_group', measurementNode).hide();
      $('.retention_time', measurementNode).hide();
      $('.wavelength', measurementNode).hide();
      $('.mass_spec_details', measurementNode).hide();
      $('.selectivity', measurementNode).hide();
    } else if (measurementType === 'CUSTOM') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).show();
      $('.wavelength', measurementNode).show();
      $('.mass_spec_details', measurementNode).show();
      $('.selectivity', measurementNode).show();
    } else if (measurementType === 'IDENTITY') {
      $('.product_measurement_value_group', measurementNode).hide();
      $('.retention_time', measurementNode).show();
      $('.wavelength', measurementNode).hide();
      $('.mass_spec_details', measurementNode).hide();
      $('.selectivity', measurementNode).hide();
    } else if (measurementType === 'YIELD') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).hide();
      $('.wavelength', measurementNode).hide();
      $('.mass_spec_details', measurementNode).hide();
      $('.selectivity', measurementNode).hide();
      $('.product_measurement_percentage', measurementNode).click();
    } else if (measurementType === 'SELECTIVITY') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).hide();
      $('.wavelength', measurementNode).hide();
      $('.mass_spec_details', measurementNode).hide();
      $('.selectivity', measurementNode).show();
      $('.product_measurement_string', measurementNode).click();
    } else if (measurementType === 'PURITY') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).hide();
      $('.wavelength', measurementNode).show();
      $('.mass_spec_details', measurementNode).hide();
      $('.selectivity', measurementNode).hide();
      $('.product_measurement_percentage', measurementNode).click();
    } else if (measurementType === 'AREA') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).show();
      $('.wavelength', measurementNode).show();
      $('.mass_spec_details', measurementNode).show();
      $('.selectivity', measurementNode).hide();
      $('.product_measurement_float', measurementNode).click();
    } else if (measurementType === 'COUNTS') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).show();
      $('.wavelength', measurementNode).hide();
      $('.mass_spec_details', measurementNode).show();
      $('.selectivity', measurementNode).hide();
      $('.product_measurement_float', measurementNode).click();
    } else if (measurementType === 'INTENSITY') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).show();
      $('.wavelength', measurementNode).show();
      $('.mass_spec_details', measurementNode).show();
      $('.selectivity', measurementNode).hide();
      $('.product_measurement_float', measurementNode).click();
    } else if (measurementType === 'AMOUNT') {
      $('.product_measurement_value_group', measurementNode).show();
      $('.retention_time', measurementNode).hide();
      $('.wavelength', measurementNode).hide();
      $('.mass_spec_details', measurementNode).hide();
      $('.selectivity', measurementNode).hide();
      $('.product_measurement_mass', measurementNode).click();
    }
  });
  measurementTypeSelector.trigger('change');

  return measurementNode;
}

/**
 * Adds and populates a ProductMeasurement section in the form.
 * @param {!Node} productNode The parent ProductCompound node.
 * @param {!proto.ord.ProductMeasurement} measurement
 */
function loadMeasurement(productNode, measurement) {
  const node = addMeasurement(productNode);
  $('.analysis_key_selector', node).val(measurement.getAnalysisKey());
  ord.utils.setSelector(
      $('.product_measurement_type', node), measurement.getType());
  $('.product_measurement_type select', node).trigger('change');
  $('.product_measurement_details', node).text(measurement.getDetails());
  ord.utils.setOptionalBool(
      $('.product_measurement_uses_internal_standard', node),
      measurement.hasUsesInternalStandard() ?
          measurement.getUsesInternalStandard() :
          null);
  ord.utils.setOptionalBool(
      $('.product_measurement_is_normalized', node),
      measurement.hasIsNormalized() ? measurement.getIsNormalized() : null);
  ord.utils.setOptionalBool(
      $('.product_measurement_uses_authentic_standard', node),
      measurement.hasUsesAuthenticStandard() ?
          measurement.getUsesAuthenticStandard() :
          null);

  const authenticStandard = measurement.getAuthenticStandard();
  if (authenticStandard) {
    ord.compounds.loadIntoCompound(node, authenticStandard);
  }
  $('.product_measurement_uses_authentic_standard', node).trigger('change');

  if (measurement.hasPercentage()) {
    $('.product_measurement_percentage', node).click();
    $('.product_measurement_value', node).addClass('floattext');
    if (measurement.getPercentage().hasValue()) {
      $('.product_measurement_value', node)
          .text(measurement.getPercentage().getValue());
    }
    if (measurement.getPercentage().hasPrecision()) {
      $('.product_measurement_precision', node)
          .text(measurement.getPercentage().getPrecision());
    }
  } else if (measurement.hasFloatValue()) {
    $('.product_measurement_float', node).click();
    $('.product_measurement_value', node).addClass('floattext');
    if (measurement.getFloatValue().hasValue()) {
      $('.product_measurement_value', node)
          .text(measurement.getFloatValue().getValue());
    }
    if (measurement.getFloatValue().hasPrecision()) {
      $('.product_measurement_precision', node)
          .text(measurement.getFloatValue().getPrecision());
    }
  } else if (measurement.getStringValue()) {
    $('.product_measurement_string', node).click();
    $('.product_measurement_value', node).removeClass('floattext');
    if (measurement.getStringValue()) {
      $('.product_measurement_value', node).text(measurement.getStringValue());
    }
  } else if (measurement.hasAmount()) {
    $('.product_measurement_mass', node).click();
    const valueNode = $('.product_measurement_value_type', node);
    ord.amounts.load(valueNode, measurement.getAmount());
  }

  const retentionTime = measurement.getRetentionTime();
  if (retentionTime) {
    ord.utils.writeMetric(
        '.product_measurement_retention_time', retentionTime, node);
  }

  const massSpec = measurement.getMassSpecDetails();
  if (massSpec) {
    ord.utils.setSelector(
        $('.product_measurement_mass_spec_type', node), massSpec.getType());
    $('.product_measurement_mass_spec_details', node)
        .text(massSpec.getDetails());
    ord.utils.setOptionalBool(
        $('.product_measurement_mass_spec_tic_minimum_mz', node),
        massSpec.hasTicMinimumMz() ? massSpec.getTicMinimumMz() : null);
    ord.utils.setOptionalBool(
        $('.product_measurement_mass_spec_tic_maximum_mz', node),
        massSpec.hasTicMaximumMz() ? massSpec.getTicMaximumMz() : null);
    const eicMasses = massSpec.getEicMassesList().join(',');
    $('.product_measurement_mass_spec_eic_masses', node).text(eicMasses);
  }

  const selectivity = measurement.getSelectivity();
  if (selectivity) {
    ord.utils.setSelector(
        $('.product_measurement_selectivity_type', node),
        selectivity.getType());
    $('.product_measurement_selectivity_details', node)
        .text(selectivity.getDetails());
  }

  const wavelength = measurement.getWavelength();
  if (wavelength) {
    ord.utils.writeMetric('.product_measurement_wavelength', wavelength, node);
  }
}

/**
 * Fetches a ProductMeasurement defined in the form.
 * @param {!Node} node An element containing a ProductMeasurement.
 * @return {!proto.ord.ProductMeasurement}
 */
function unloadMeasurement(node) {
  const measurement = new proto.ord.ProductMeasurement();
  const analysisKey = $('.product_measurement_analysis_key select', node).val();
  if (analysisKey) {
    measurement.setAnalysisKey(analysisKey);
  }
  measurement.setType(
      ord.utils.getSelector($('.product_measurement_type', node)));
  measurement.setDetails($('.product_measurement_details', node).text());
  measurement.setUsesInternalStandard(ord.utils.getOptionalBool(
      $('.product_measurement_uses_internal_standard', node)));
  measurement.setIsNormalized(
      ord.utils.getOptionalBool($('.product_measurement_is_normalized', node)));
  measurement.setUsesAuthenticStandard(ord.utils.getOptionalBool(
      $('.product_measurement_uses_authentic_standard', node)));

  const authenticStandardNode =
      $('.product_measurement_authentic_standard', node);
  const compound = ord.compounds.unloadCompound(authenticStandardNode);
  if (!ord.utils.isEmptyMessage(compound)) {
    measurement.setAuthenticStandard(compound);
  }

  if ($('.product_measurement_percentage', node).is(':checked')) {
    const percentage = new proto.ord.Percentage();
    const value = parseFloat($('.product_measurement_value', node).text());
    if (!isNaN(value)) {
      percentage.setValue(value);
    }
    const precision =
        parseFloat($('.product_measurement_precision', node).text());
    if (!isNaN(precision)) {
      percentage.setPrecision(precision);
    }
    if (!ord.utils.isEmptyMessage(percentage)) {
      measurement.setPercentage(percentage);
    }
  } else if ($('.product_measurement_float', node).is(':checked')) {
    const floatValue = new proto.ord.FloatValue();
    const value = parseFloat($('.product_measurement_value', node).text());
    if (!isNaN(value)) {
      floatValue.setValue(value);
    }
    const precision =
        parseFloat($('.product_measurement_precision', node).text());
    if (!isNaN(precision)) {
      floatValue.setPrecision(precision);
    }
    if (!ord.utils.isEmptyMessage(floatValue)) {
      measurement.setFloatValue(floatValue);
    }
  } else if ($('.product_measurement_string', node).is(':checked')) {
    const stringValue = $('.product_measurement_value', node).text();
    if (stringValue) {
      measurement.setStringValue(stringValue);
    }
  } else if ($('.product_measurement_mass', node).is(':checked')) {
    const amount =
        ord.amounts.unload($('.product_measurement_value_type', node));
    if (!ord.utils.isEmptyMessage(amount)) {
      measurement.setAmount(amount);
    }
  }

  const retentionTime = ord.utils.readMetric(
      '.product_measurement_retention_time', new proto.ord.Time(), node);
  if (!ord.utils.isEmptyMessage(retentionTime)) {
    measurement.setRetentionTime(retentionTime);
  }

  const massSpecDetails =
      new proto.ord.ProductMeasurement.MassSpecMeasurementDetails();
  massSpecDetails.setType(
      ord.utils.getSelector($('.product_measurement_mass_spec_type', node)));
  massSpecDetails.setDetails(
      $('.product_measurement_mass_spec_details', node).text());
  massSpecDetails.setTicMinimumMz(ord.utils.getOptionalBool(
      $('.product_measurement_mass_spec_tic_minimum_mz', node)));
  massSpecDetails.setTicMaximumMz(ord.utils.getOptionalBool(
      $('.product_measurement_mass_spec_tic_maximum_mz', node)));
  if ($('.product_measurement_mass_spec_eic_masses', node).text()) {
    const eicMasses = $('.product_measurement_mass_spec_eic_masses', node)
                          .text()
                          .split(',')
                          .map(parseFloat);
    massSpecDetails.setEicMassesList(eicMasses);
  }
  if (!ord.utils.isEmptyMessage(massSpecDetails)) {
    measurement.setMassSpecDetails(massSpecDetails);
  }

  const selectivity = new proto.ord.ProductMeasurement.Selectivity();
  selectivity.setType(
      ord.utils.getSelector($('.product_measurement_selectivity_type', node)));
  selectivity.setDetails(
      $('.product_measurement_selectivity_details', node).text());
  if (!ord.utils.isEmptyMessage(selectivity)) {
    measurement.setSelectivity(selectivity);
  }

  const wavelength = ord.utils.readMetric(
      '.product_measurement_wavelength', new proto.ord.Wavelength(), node);
  if (!ord.utils.isEmptyMessage(wavelength)) {
    measurement.setWavelength(wavelength);
  }
  return measurement;
}

/**
 * Validates a ProductMeasurement defined in the form.
 * @param {!Node} node A node containing a ProductMeasurement.
 * @param {?Node=} validateNode The target div for validation results.
 */
function validateMeasurement(node, validateNode = null) {
  const measurement = unloadMeasurement(node);
  ord.utils.validate(measurement, 'ProductMeasurement', node, validateNode);
}

/**
 * Validates a product defined in the form.
 * @param {!Node} node A node containing a reaction product.
 * @param {?Node=} validateNode The target div for validation results.
 */
function validateProduct(node, validateNode = null) {
  const product = unloadProduct(node);
  ord.utils.validate(product, 'ProductCompound', node, validateNode);
  ord.compounds.renderCompound(node, product);
}
