# Cloud storage for DailyDoase generations

DailyDoase currently serves its generation gallery from local files. This sync command publishes those files to an S3-compatible object store and keeps the existing folder layout, including JSON sidecars.

## Cheapest practical choice

Cloudflare R2 is a good fit for a public media gallery: Standard storage costs $0.015 per GB-month, the first 10 GB-month and included request allowances are free, and internet egress is free. That avoids bandwidth bills when people view videos. [Current R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Amazon S3 is also supported. S3 can be a better fit if the rest of your hosting already runs on AWS; serving through CloudFront avoids S3-to-CloudFront transfer charges, though CloudFront viewer delivery has its own pricing. [S3 pricing](https://aws.amazon.com/s3/pricing/) · [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)

## Publish generations

Install AWS CLI v2, then set credentials as environment variables. For R2, create an R2 bucket and an API token with Object Read & Write access for that bucket. Keep the token secret; never put it in source code or commit it.

```sh
export AWS_ACCESS_KEY_ID='R2_ACCESS_KEY_ID'
export AWS_SECRET_ACCESS_KEY='R2_SECRET_ACCESS_KEY'
export AWS_DEFAULT_REGION='auto'
export GENERATION_S3_ENDPOINT='https://ACCOUNT_ID.r2.cloudflarestorage.com'
export GENERATION_BUCKET='dailydoase-generations'
export GENERATIONS_PATH='/path/to/your/GENERATIONS'
node scripts/publish-generations-to-cloud.mjs
```

For Amazon S3, configure AWS credentials with the AWS CLI, set `AWS_DEFAULT_REGION` and `GENERATION_BUCKET`, then leave `GENERATION_S3_ENDPOINT` unset. `GENERATIONS_PATH` defaults to the repository's `GENERATIONS` directory. Optional `GENERATION_PREFIX` publishes under a bucket subfolder.

The command enforces a 100 GB projected bucket-size ceiling before upload. It counts existing objects in the bucket plus local files that would be added or replaced. If the estimate exceeds 100 GB, the upload stops before syncing. Use a dedicated bucket and this command as its only writer; dashboard uploads or other apps can bypass this guard. This is an application-side guard, not a Cloudflare billing cap.

The command only adds or updates cloud files; it does not delete remote files. It is a manual publish step today. Run it after generation jobs finish so the local size check does not race with new files being written.

Cloudflare budget alerts can notify you when usage charges cross a chosen amount, but they do not pause or cap usage. They are a second warning layer, not a hard limit. [Budget alert behavior](https://developers.cloudflare.com/billing/manage/budget-alerts/)

## Gallery hosting

The current Express gallery reads local generation folders. Cloud publishing makes a remote copy; it does not yet switch the live gallery to cloud URLs or host the Express app. To make the site fully cloud-backed, deploy the app where it can read the bucket, or add a public custom domain to the R2 bucket and update gallery metadata URLs. Keep bucket credentials server-side; never expose write credentials in browser code.
