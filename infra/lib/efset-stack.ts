import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';

export class EfsetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const recordsTable = new dynamodb.Table(this, 'RecordsTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const recordsFunction = new nodejs.NodejsFunction(this, 'RecordsFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/lambda/records.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        TABLE_NAME: recordsTable.tableName,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node22',
      },
    });
    recordsTable.grantReadWriteData(recordsFunction);

    const geminiApiKey = new cdk.CfnParameter(this, 'GeminiApiKey', {
      type: 'String',
      default: '',
      noEcho: true,
      description: 'Google AI Studio Gemini API key. Leave blank to disable AI features.',
    });

    const aiFunction = new nodejs.NodejsFunction(this, 'AiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../src/lambda/ai.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        GEMINI_API_KEY: geminiApiKey.valueAsString,
        GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'models/gemini-3.6-flash',
      },
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node22',
      },
    });

    const api = new apigwv2.HttpApi(this, 'RecordsApi', {
      corsPreflight: {
        allowHeaders: ['content-type'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        maxAge: Duration.days(1),
      },
    });
    api.addRoutes({
      path: '/api/records',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('RecordsIntegration', recordsFunction),
    });
    api.addRoutes({
      path: '/api/ai',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('AiIntegration', aiFunction),
    });

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const apiHostname = Fn.select(2, Fn.split('/', api.apiEndpoint));
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        'api/*': {
          origin: new origins.HttpOrigin(apiHostname),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../site'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront URL for the EF SET practice site',
    });
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.apiEndpoint,
      description: 'HTTP API endpoint (CloudFront /api/* is the browser-facing route)',
    });
    new cdk.CfnOutput(this, 'RecordsTableName', {
      value: recordsTable.tableName,
    });
  }
}
