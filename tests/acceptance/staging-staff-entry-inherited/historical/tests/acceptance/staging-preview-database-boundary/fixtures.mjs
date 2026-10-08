const privateURL='postgresql://private_staff:private_fixture_password@ep-private-fixture-pooler.c-4.us-west-2.aws.neon.tech/private_fixture_database?sslmode=verify-full';
const managedURL='postgresql://managed_staff:managed_fixture_password@ep-managed-fixture-pooler.c-4.us-west-2.aws.neon.tech/managed_fixture_database?sslmode=require';
const localURL='postgresql://local_staff:local_fixture_password@127.0.0.1:15487/bz_test_selector_fixture';
const preview={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'boundary-fixture.vercel.app',APP_ORIGIN:'https://boundary-fixture.vercel.app',BIDZIZI_APP_MODE:'staging',BIDZIZI_STAGING_TEST_AUTH:'true',BIDZIZI_STAGING_DATABASE_URL:privateURL,DATABASE_URL:managedURL};
const local={APP_ORIGIN:'http://127.0.0.1:14387',BIDZIZI_APP_MODE:'local-test',BIDZIZI_STAGING_TEST_AUTH:'true',BIDZIZI_LOCAL_TEST_DATABASE:'true',DATABASE_URL:localURL,BIDZIZI_STAGING_DATABASE_URL:privateURL};
const permitted=[
 {id:'preview-private-over-conflicting-managed',env:preview,value:privateURL,ssl:{rejectUnauthorized:true},attached:1},
 {id:'local-disposable-default-over-private',env:local,value:localURL,ssl:false,attached:0},
];
const refused=[
 {id:'preview-private-missing-never-default',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:undefined}},
 {id:'preview-private-empty-never-default',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:''}},
 {id:'production-even-with-private',env:{...preview,VERCEL_ENV:'production'}},
 {id:'development-even-with-private',env:{...preview,VERCEL_ENV:'development'}},
 {id:'preview-non-staging-mode',env:{...preview,BIDZIZI_APP_MODE:'local-test'}},
 {id:'vercel-without-preview-context',env:{...preview,VERCEL_ENV:undefined}},
 {id:'preview-context-without-vercel-marker',env:{...preview,VERCEL:undefined}},
 {id:'unconfigured-local-mode',env:{DATABASE_URL:managedURL,BIDZIZI_STAGING_DATABASE_URL:privateURL}},
 {id:'local-disposable-opt-in-missing',env:{...local,BIDZIZI_LOCAL_TEST_DATABASE:undefined}},
 {id:'local-shared-database-name',env:{...local,DATABASE_URL:localURL.replace('/bz_test_selector_fixture','/shared_fixture_database')}},
 {id:'local-standard-postgres-port',env:{...local,DATABASE_URL:localURL.replace(':15487/',':5432/')}},
 {id:'local-nonloopback-database',env:{...local,DATABASE_URL:managedURL}},
];
export const selectorCases=[...permitted,...refused];
export const adapterCases=[...permitted,...refused,
 {id:'preview-reject-unpooled-host',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:privateURL.replace('ep-private-fixture-pooler.','ep-private-fixture.')}},
 {id:'preview-reject-nonneon-host',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:privateURL.replace('.neon.tech/','.invalid/')}},
 {id:'preview-reject-absent-tls-mode',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:privateURL.replace('?sslmode=verify-full','')}},
 {id:'preview-reject-disabled-tls-mode',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:privateURL.replace('sslmode=verify-full','sslmode=disable')}},
 {id:'preview-verified-tls-cannot-be-url-overridden',env:{...preview,BIDZIZI_STAGING_DATABASE_URL:privateURL+'&sslcert=fixture&sslkey=fixture&sslrootcert=fixture'},value:privateURL+'&sslcert=fixture&sslkey=fixture&sslrootcert=fixture',ssl:{rejectUnauthorized:true},attached:1},
];
