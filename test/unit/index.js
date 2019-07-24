'use strict';
const chai = require('chai');
const expect = chai.expect;
const Promisie = require('promisie');
const MOCKS = require('../mocks');
const path = require('path');
const CREATE_EVALUATOR = require(path.join(__dirname, '../../lib')).create;

chai.use(require('chai-spies'));

describe('output module', function () {
  describe('basic assumptions', function () {
    it('should have a create method that is a function', () => {
      expect(CREATE_EVALUATOR).to.be.a('function');
    });
    it('should accept a segment as an arguments and generate an evaluator', () => {
      let evaluator = CREATE_EVALUATOR(MOCKS.DEFAULT, 'output_module');
      expect(evaluator).to.be.a('function');
    });
  });

  describe('evaluation of simple rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.BASIC, 'output_module');
      done();
    });
    it('should return the output that meets the conditions', async function () {
      let result = await evaluation({
        age: 19,
        country: 'United States',
        family_income: 30000,
      });
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('old_enough');
      expect(result.output).to.have.property('primary_language');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('scholarship');
      expect(result.output['old_enough']).to.equal(true);
      expect(result.output['primary_language']).to.equal('English');
      expect(result.output['required_language_hours']).to.equal(0);
      expect(result.output[ 'scholarship' ]).to.equal(50000);
      result = await evaluation({
        age: 0,
        country: 'Nigeria',
        family_income: 300000,
      });
      expect(Object.keys(result.output).length).to.equal(1);
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output['required_language_hours']).to.equal(120);
    });
    it('should properly handle an error', async function () {
      let result = await evaluation({
        age: 20,
      });
      expect(result.error).to.have.string('The Variable country is required by a Rule but is not defined.');
      expect(result.result).to.be.empty;
    });
  });

  describe('evaluation of complex rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.COMPLEX, 'output_module');
      done();
    });
    it('should return highest possible weight when all evaluations result in true', async function () {
      let result = await evaluation({
        age: 19,
        country: 'United States',
        family_income: 30000,
        has_sat_ii_english: true,
        has_dependents: true,
      });
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('old_enough');
      expect(result.output).to.have.property('primary_language');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('scholarship');
      expect(result.output[ 'old_enough' ]).to.equal(true);
      expect(result.output[ 'primary_language' ]).to.equal('English');
      expect(result.output[ 'required_language_hours' ]).to.equal(0);
      expect(result.output[ 'scholarship' ]).to.equal(50000);
    });
    it('should still return the same output even when one of OR evaluation results in false', async function () {
      let result = await evaluation({
        age: 19,
        country: 'United States',
        family_income: 30000,
        has_sat_ii_english: true,
        has_dependents: true,
      });
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('old_enough');
      expect(result.output).to.have.property('primary_language');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('scholarship');
      expect(result.output[ 'old_enough' ]).to.equal(true);
      expect(result.output[ 'primary_language' ]).to.equal('English');
      expect(result.output[ 'required_language_hours' ]).to.equal(0);
      expect(result.output[ 'scholarship' ]).to.equal(50000);
    });
    it('should not return the output of the rule if all of the OR evaluations result in false', async function () {
      let result = await evaluation({
        age: 19,
        country: 'United States',
        family_income: 200000,
        has_sat_ii_english: true,
        has_dependents: false,
      });
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('old_enough');
      expect(result.output).to.have.property('primary_language');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('scholarship');
      expect(result.output[ 'old_enough' ]).to.equal(true);
      expect(result.output[ 'primary_language' ]).to.equal('English');
      expect(result.output[ 'required_language_hours' ]).to.equal(0);
      expect(result.output[ 'scholarship' ]).to.equal(10000);
    });
    it('should not return the output of the rule if one of the AND evaluation results in false', async function () {
      let result = await evaluation({
        age: 19,
        country: 'France',
        family_income: 30000,
        has_sat_ii_english: false,
        has_dependents: true,
      });
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('old_enough');
      expect(result.output).to.not.have.property('primary_language');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('scholarship');
      expect(result.output[ 'old_enough' ]).to.equal(true);
      expect(result.output[ 'required_language_hours' ]).to.equal(120);
      expect(result.output[ 'scholarship' ]).to.equal(50000);
      result = await evaluation({
        age: 19,
        country: 'France',
        family_income: 30000,
        has_sat_ii_english: true,
        has_dependents: true,
      });
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('old_enough');
      expect(result.output).to.not.have.property('primary_language');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('scholarship');
      expect(result.output[ 'old_enough' ]).to.equal(true);
      expect(result.output[ 'required_language_hours' ]).to.equal(60);
      expect(result.output[ 'scholarship' ]).to.equal(50000);
    });
  });

  describe('evaluation of dynamic value rules', function () {
    let evaluation;
    before(done => {
      evaluation = CREATE_EVALUATOR(MOCKS.DYNAMIC, 'output_module');
      done();
    });
    it('should do comparison against the variables on the state', async function () {
      let _state = {
        preferred_language: "French",
        calculated_language_hours: 50,
        country: "France",
        family_income: 120000,
        dynamic_income_low: 30000,
        dynamic_income_high: 150000,
        gpa: 3.8,
        gpa_limit: 3.5,
      };
      let result = await evaluation(_state);
      expect(result).to.have.property('output');
      expect(result.output).to.have.property('primary_language');
      expect(result.output).to.have.property('scholarship');
      expect(result.output).to.have.property('required_language_hours');
      expect(result.output).to.have.property('additional_scholarship');
      expect(result.output[ 'primary_language' ]).to.equal(_state.preferred_language);
      expect(result.output[ 'required_language_hours' ]).to.equal(_state.calculated_language_hours);
      expect(result.output[ 'scholarship' ]).to.equal(50000);
      expect(result.output[ 'additional_scholarship' ]).to.equal(50000);
      let second_result = await evaluation({
        preferred_language: "French",
        calculated_language_hours: 50,
        country: "Greece",
        family_income: 200000,
        dynamic_income_low: 30000,
        dynamic_income_high: 150000,
        gpa: 3.2,
        gpa_limit: 3.5,
      });
      expect(second_result).to.have.property('output');
      expect(second_result.output).to.be.empty;
    });
    it('should error when missing a variable for range comparison', async function () {
      let result = await evaluation({
        preferred_language: "French",
        calculated_language_hours: 50,
        country: "France",
        family_income: 120000,
        dynamic_income_high: 150000,
        gpa: 3.8,
        gpa_limit: 3.5,
      });
      expect(result.error).to.have.string('The Variable dynamic_income_low is required by a Rule but is not defined.');
      expect(result.output).to.be.empty;
      result = await evaluation({
        preferred_language: "French",
        calculated_language_hours: 50,
        country: "France",
        family_income: 120000,
        dynamic_income_low: 100000,
        gpa: 3.8,
        gpa_limit: 3.5,
      });
      expect(result.error).to.have.string('The Variable dynamic_income_high is required by a Rule but is not defined.');
      expect(result.output).to.be.empty;
    });
    it('should error when missing a variable for value comparison', async function () {
      let result = await evaluation({
        preferred_language: "French",
        calculated_language_hours: 50,
        country: "France",
        family_income: 120000,
        dynamic_income_low: 100000,
        dynamic_income_high: 150000,
        gpa: 3.8,
      });
      expect(result.error).to.have.string('The Variable gpa_limit is required by a Rule but is not defined.');
      expect(result.output).to.be.empty;
    });
    it('should error when missing a variable for condition output', async function () {
      let result = await evaluation({
        calculated_language_hours: 50,
        country: "France",
        family_income: 120000,
        dynamic_income_low: 100000,
        dynamic_income_high: 150000,
        gpa: 3.8,
        gpa_limit: 3.5,
      });
      expect(result.error).to.have.string('The Variable preferred_language is required by a Rule but is not defined.');
      expect(result.result).to.be.empty;
    });
  });
});