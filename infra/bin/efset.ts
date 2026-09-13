#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EfsetStack } from '../lib/efset-stack';

const app = new cdk.App();

new EfsetStack(app, 'EfsetStack', {
  description: 'EF SET 30-day practice: static site and server-side learning records',
});
