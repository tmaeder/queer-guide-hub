import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backendMigrationGrantFixture } from './seed-backend-migration-grants.mjs'

const migration="FOREACH t IN ARRAY ARRAY['email_example','email_lookup'] LOOP"
test('backend snapshot fixture refuses production and invalid migration inputs',()=>{
 assert.throws(()=>backendMigrationGrantFixture('postgres://example.org/postgres',migration),/local|loopback/i)
 assert.throws(()=>backendMigrationGrantFixture('postgres://127.0.0.1/postgres',"FOREACH t IN ARRAY ARRAY['auth_users'] LOOP"),/contract/)
 assert.throws(()=>backendMigrationGrantFixture('postgres://127.0.0.1/postgres',''),/contract/)
})
test('snapshot fixture restores browser denial without granting service capabilities',()=>{
 const sql=backendMigrationGrantFixture('postgres://postgres@127.0.0.1:54322/postgres',migration)
 assert.match(sql,/revoke all privileges on table public\.%I from public,anon,authenticated/)
 assert.match(sql,/existing service SELECT/)
 assert.doesNotMatch(sql,/\bgrant\s+/i)
})
