'use strict';
const vm = require('vm');
const Promisie = require('promisie');
const Conditional = require('@digifi-los/comparison').Conditional;

/**
 * Sets state inside of a "_global" property and contextifies with a compare function in its scope
 * @param {Object} state Application state data containing data from previous functions
 * @param {function} compare A bound copy of the Conditional.compare method
 * @return {Object} VM contextified state object
 */
var createContext = function (state, compare) {
  let _global = { state, };
  let context = { _global, compare, };
  vm.createContext(context);
  return context;
};

/**
 * Handles coverting values to string representations consumable by the VM script
 * @param  {*} value Value to convert for the VM
 * @return {string|number}       Converted value
 */
var handleValueAssignment = function (value) {
  if (typeof value === 'string' && value.includes('_global.state')) return value;
  if (typeof value === 'string') return `'${value}'`;
  else if (Array.isArray(value)) {
    return (
      value.reduce((result, v, index) => {
        result +=
          (typeof v === 'string' ? `'${v}'` : v) +
          (index !== value.length - 1 ? ', ' : '');
        return result;
      }, '[') + ']'
    );
  } else if (value && typeof value === 'object') return JSON.stringify(value);
  else return value;
};

/**
 * Handles tracking unique or group ids and their associated condition output
 * @param  {Object[]} groups   An array of touples arranged as groupid, object containing condition output
 * @param  {string} groupid  A string representing a group id for the or group
 * @param  {string|string[]}  condition_output  condition output or codes associated to the or group
 * @return {Object[]}          Updated or group array
 */
var handleOrGroupInsertion = function (groups, groupid, condition_output = {}) {
  let groupIndex = groups.indexOf(groupid);
  if (groupIndex === -1) {
    groups.push([
      groupid,
      {
        condition_output:
          typeof condition_output === 'string'
            ? [ condition_output, ]
            : condition_output || [],
      }
    ]);
  } else if (condition_output) {
    let group = groups[ groupIndex ];
    group.condition_output = Object.assign({}, group.condition_output, condition_output)
  }
  return groups;
};

/**
 * Handles tracking unique or group ids and their associated condition output
 * @param  {Object[]} groups   An array of touples arranged as groupid, object containing condition output
 * @param  {string} groupid  A string representing a group id for the or group
 * @param  {string|string[]}  condition_output  condition output or codes associated to the or group
 * @return {Object[]}          Updated or group array
 */
var handleAndGroupInsertion = function (groups, groupid, condition_output = {}) {
  let groupIndex = groups.indexOf(groupid);
  if (groupIndex === -1) {
    groups.push([
      groupid,
      {
        condition_output:
          typeof condition_output === 'string'
            ? [ condition_output, ]
            : condition_output || [],
      },
    ]);
  } else if (condition_output) {
    let group = groups[ groupIndex ];
    group.condition_output = Object.assign({}, group.condition_output, condition_output);
  }
  return groups;
};

/**
 * Creates a script that will be run inside of vm based on segment configuration
 * @param {Object} ruleset Configuration object for segement evaluator
 * @param {Object[]} ruleset.rules Array of evaluations that should be run against data
 * @param {string} ruleset.rules.rule_types Describes if passing condition should be all-true ("AND") or one true ("OR")
 * @param {string} ruleset.rules.variable_name The field which should be evaluated within the state object
 * @param {string} ruleset.rules.value_comparison Value which data derived from state object should be compared against
 * @param {string} ruleset.rules.condition_test Description of the conditional test to be applied
 * @param {string} [ruleset.rules.rule_name] Defines a "OR" group id and is required for proper evaluation of "OR" group
 * @param {string} ruleset.rules.condition_output Defines the key on the output that the individual pass/fail evaluation should be recorded on
 * @return {string} Returns a string representation of a script to be run in VM
 */
var createScript = function (ruleset) {
  let rules = ruleset;
  let or_requirement_groups = [];
  let and_requirement_groups = [];
  let string_evaluator = rules.reduce((script, test) => {
    let {
      variable_name,
      condition_test,
      rule_type,
      rule_name,
      condition_output,
      condition_output_types,
      value_comparison,
      value_minimum,
      value_maximum,
      value_comparison_type,
      value_minimum_type,
      value_maximum_type,
    } = test;
    let condition1 = condition_test.toLowerCase().replace(/\s+/g, '');
    let condition2;
    let or_test = /or/i.test(rule_type);
    let and_test = /and/i.test(rule_type);
    let eval_group;

    value_comparison = (value_comparison && value_comparison_type === 'variable') ? `_global.state['${value_comparison}']` : value_comparison;
    value_minimum = (value_minimum && value_minimum_type === 'variable') ? `_global.state['${value_minimum}']` : value_minimum;
    value_maximum = (value_maximum && value_maximum_type === 'variable') ? `_global.state['${value_maximum}']` : value_maximum;

    script += `if(_global.state["${variable_name}"] === undefined) throw new Error('The Variable ${variable_name} is required by a Rule but is not defined.');\r\n`;
    script += `if(/range/i.test("${condition_test}") && ${handleValueAssignment(value_minimum)} === undefined) throw new Error("The Variable ${test.value_minimum} is required by a Rule but is not defined.");\r\n`;
    script += `if(/range/i.test("${condition_test}") && ${handleValueAssignment(value_maximum)} === undefined) throw new Error("The Variable ${test.value_maximum} is required by a Rule but is not defined.");\r\n`;
    script += `if(!(/range/i.test("${condition_test}")) && !(/null/i.test("${condition_test}")) && ${handleValueAssignment(value_comparison)} === undefined) throw new Error("The Variable ${test.value_comparison} is required by a Rule but is not defined.");\r\n`;

    script += `evaluation_result = compare(_global.state[${handleValueAssignment(variable_name)}]).${condition1}`;

    if (typeof condition2 === 'string') script += `.${condition2}`;

    script += `(${
      /range/i.test(condition_test)
        ? handleValueAssignment(value_minimum) + ', ' + handleValueAssignment(value_maximum)
        : handleValueAssignment(value_comparison)
      });\r\n`;

    if (or_test && rule_name) {
      script += `_global.${rule_name} = _global.${rule_name} || [];\r\n`;
      eval_group = `_global.${rule_name}`;
      or_requirement_groups = handleOrGroupInsertion(
        or_requirement_groups,
        rule_name
      );
    } else if (and_test && rule_name) {
      script += `_global.${rule_name} = _global.${rule_name} || [];\r\n`;
      eval_group = `_global.${rule_name}`;
      and_requirement_groups = handleAndGroupInsertion(
        and_requirement_groups,
        rule_name
      );
    } else eval_group = '_global.passes';

    script += `${eval_group}.push(evaluation_result);\r\n`;
    script += `_global.output[${handleValueAssignment(rule_name)}] = evaluation_result;\r\n`;
    script += `_global.output_types = Object.assign({}, _global.output_types, ${handleValueAssignment(condition_output_types)})\r\n`;
    script += `_global.rule_results.push(Object.assign({}, {name: ${handleValueAssignment(rule_name)}, passed: evaluation_result,}, {condition_output: ${handleValueAssignment(condition_output)}}))\r\n`;

    return script;
  }, '"use strict";\r\n_global.passes = [];\r\n_global.output = {};\r\n_global.rule_results = [];\r\n_global.output_types = {};\r\nlet evaluation_result;\r\n');


  let or_evaluations = or_requirement_groups.length
    ? or_requirement_groups.reduce((result, groupkey, index) => {
      string_evaluator += `_global.output.${groupkey[ 0 ]} = _global.${
        groupkey[ 0 ]
        }.indexOf(true) !== -1;\r\n`;

      if (index < or_requirement_groups.length - 1)
        result += `_global.${groupkey[ 0 ]}.indexOf(true) !== -1 && `;
      else result += `_global.${groupkey[ 0 ]}.indexOf(true) !== -1`;

      return result;
    }, '(') + ')'
    : false;

  let and_evaluations = and_requirement_groups.length
    ? and_requirement_groups.reduce((result, groupkey, index) => {
      string_evaluator += `_global.output.${groupkey[ 0 ]} = _global.${
        groupkey[ 0 ]
        }.every((item) => {return item === true});\r\n`;

      if (index < and_requirement_groups.length - 1)
        result += `_global.${
          groupkey[ 0 ]
          }.every((item) => {return item === true}) && `;
      else
        result += `_global.${
          groupkey[ 0 ]
          }.every((item) => {return item === true})`;

      return result;
    }, '(') + ')'
    : false;

  string_evaluator +=
    or_evaluations && and_evaluations
      ? `_global.passes = (_global.passes.indexOf(false) === -1 && ${or_evaluations} && ${and_evaluations});\r\n`
      : or_evaluations && !and_evaluations
        ? `_global.passes = (_global.passes.indexOf(false) === -1 && ${or_evaluations});\r\n`
        : !or_evaluations && and_evaluations
          ? `_global.passes = (_global.passes.indexOf(false) === -1 && ${and_evaluations});\r\n`
          : '_global.passes = _global.passes.indexOf(false) === -1';
  return string_evaluator;
};

const getOutputResults = function (output, output_result) {
  let result = {};
  output.forEach((rule_output, idx) => {
    if (output_result[ rule_output.name ] === true) {
      result = Object.assign({}, result, rule_output.condition_output);
    }
  })
  return result;
};

/**
 * Creates an evaluator function
 * @param {Object} segment Configuration details for script and context of a vm that will be evaluated
 * @param {boolean} numeric If true percision evalutions will be performed on all numerical comparisons (uses the numeric npm package)
 * @param {string} external_product The external product id assigned to the pricing table
 * @return {Function} Segment evaluator function
 */
var createEvaluator = function (segment, module_name) {
  let script = createScript(segment.ruleset);
  let conditional = new Conditional();
  let compare = conditional.compare.bind(conditional);
  /**
   * Evaluates current state against the defined segment rules
   * @param {Object} state State data used in evaluation of segment
   * @return {Object} returns the an object containing data from a matching price row or rows
   */
  return function evaluator(state) {
    let _state = Object.assign({}, state);
    let context = createContext(_state, compare);
    let evaluate = new vm.Script(script);
    let result = {};
    try {
      let output;
      let output_types;
      evaluate.runInContext(context);
      output = getOutputResults(context._global.rule_results, context._global.output);
      output_types = context._global.output_types;
      for (let key in output) {
        if (output_types[ key ] === 'variable' && state[ output[ key ] ] === undefined) {
          throw new Error(`The Variable ${output[ key ]} is required by a Rule but is not defined.`);
        } else {
          output[ key ] = (output_types[ key ] === 'variable') ? state[ output[ key ] ] : output[ key ];
        }
      }

      if (output) {
        result = Object.assign(
          {
            name: module_name || '',
            type: 'Output',
            segment: segment.name,
            rules: context._global.rule_results,
          },
          { output, }
        );
      } else {
        return Promisie.reject(
          `Multiple output results for segment ${segment.name}`
        );
      }
      if (segment.sync === true) return result;
      return Promisie.resolve(result);
    } catch (e) {
      state.error = {
        code: '',
        message: e.message,
      };
      if (segment.sync === true) return { error: e, result, };
      return Promisie.resolve({ error: e.message, result, });
    }
  };
};

module.exports = createEvaluator;