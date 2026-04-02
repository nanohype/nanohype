import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface DatabaseConstructProps {
  readonly vpc: ec2.IVpc;
  readonly computeSecurityGroup?: ec2.ISecurityGroup;
}

/**
 * Database construct for __PROJECT_NAME__.
 *
 * Provisions an RDS PostgreSQL instance with auto-generated credentials
 * stored in Secrets Manager. Single-AZ by default for development
 * cost efficiency. Security group allows inbound access from the
 * compute layer.
 */
export class DatabaseConstruct extends Construct {
  public readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: props.vpc,
      description: "__PROJECT_NAME__ database security group",
      allowAllOutbound: false,
    });

    // Allow inbound PostgreSQL traffic from the compute security group
    if (props.computeSecurityGroup) {
      dbSecurityGroup.addIngressRule(
        props.computeSecurityGroup,
        ec2.Port.tcp(5432),
        "Allow PostgreSQL access from compute layer"
      );
    }

    this.instance = new rds.DatabaseInstance(this, "PostgresInstance", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dbSecurityGroup],
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      credentials: rds.Credentials.fromGeneratedSecret("postgres", {
        secretName: "__PROJECT_NAME__/db-credentials",
      }),
      databaseName: "__PROJECT_NAME__".replace(/-/g, "_"),
      storageEncrypted: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: this.instance.dbInstanceEndpointAddress,
      description: "Database endpoint address",
    });

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: this.instance.secret?.secretArn ?? "N/A",
      description: "Database credentials secret ARN",
    });
  }
}
