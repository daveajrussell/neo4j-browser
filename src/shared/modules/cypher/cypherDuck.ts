/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Neo4j is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import neo4j, { QueryResult } from 'neo4j-driver'
import Rx from 'rxjs'

import { getClusterAddresses } from './queriesProcedureHelper'
import bolt from 'services/bolt/bolt'
import { buildTxFunctionByMode } from 'services/bolt/boltHelpers'
import {
  getUserTxMetadata,
  userActionTxMetadata
} from 'services/bolt/txMetadata'
import { flatten } from 'services/utils'
import { getActiveConnectionData } from 'shared/modules/connections/connectionsDuck'

const NAME = 'cypher'
export const CYPHER_REQUEST = `${NAME}/REQUEST`
export const ROUTED_CYPHER_READ_REQUEST = `${NAME}/ROUTED_READ_REQUEST`
export const ROUTED_CYPHER_WRITE_REQUEST = `${NAME}/ROUTED_WRITE_REQUEST`
export const AD_HOC_CYPHER_REQUEST = `${NAME}/AD_HOC_REQUEST`
export const CLUSTER_CYPHER_REQUEST = `${NAME}/CLUSTER_REQUEST`

// Helpers
const queryAndResolve = async (
  driver: any,
  action: any,
  host: any,
  metadata: { type: string; app: string },
  useDb = {}
) => {
  return new Promise(resolve => {
    const session = driver.session({
      defaultAccessMode: neo4j.session.WRITE,
      ...useDb
    })
    const txFn = buildTxFunctionByMode(session)
    txFn &&
      txFn((tx: any) => tx.run(action.query, action.parameters), { metadata })
        .then((r: any) => {
          session.close()
          resolve({
            type: action.$$responseChannel,
            success: true,
            result: {
              ...r,
              meta: action.host
            }
          })
        })
        .catch((e: any) => {
          session.close()
          resolve({
            type: action.$$responseChannel,
            success: false,
            error: e,
            host
          })
        })
  })
}
const callClusterMember = async (connection: any, action: any) => {
  return new Promise(resolve => {
    bolt
      .directConnect(connection, undefined, undefined, false) // Ignore validation errors
      .then(async driver => {
        const res = await queryAndResolve(
          driver,
          action,
          connection.host,
          userActionTxMetadata.txMetadata
        )
        driver.close()
        resolve(res)
      })
      .catch(error => {
        resolve({
          type: action.$$responseChannel,
          success: false,
          host: connection.host,
          error
        })
      })
  })
}
const routedCypherQueryResultResolver = async (
  action: any,
  promise: Promise<QueryResult>
) => {
  return promise
    .then((result: any) => ({
      type: action.$$responseChannel,
      success: true,
      result
    }))
    .catch((error: any) => ({
      type: action.$$responseChannel,
      success: false,
      error
    }))
}

// Epics
export const cypherRequestEpic = (some$: any) =>
  some$.ofType(CYPHER_REQUEST).mergeMap((action: any) => {
    if (!action.$$responseChannel) return Rx.Observable.of(null)
    return bolt
      .directTransaction(action.query, action.params || undefined, {
        ...getUserTxMetadata(action.queryType),
        useDb: action.useDb
      })
      .then((r: any) => ({
        type: action.$$responseChannel,
        success: true,
        result: r
      }))
      .catch((e: any) => ({
        type: action.$$responseChannel,
        success: false,
        error: e
      }))
  })

export const routedCypherReadRequestEpic = (some$: any) =>
  some$.ofType(ROUTED_CYPHER_READ_REQUEST).mergeMap((action: any) => {
    if (!action.$$responseChannel) return Rx.Observable.of(null)

    const promise = bolt.routedReadTransaction(action.query, action.params, {
      ...getUserTxMetadata(action.queryType || null),
      cancelable: true,
      useDb: action.useDb
    })

    return routedCypherQueryResultResolver(action, promise)
  })

export const routedCypherWriteRequestEpic = (some$: any) =>
  some$.ofType(ROUTED_CYPHER_WRITE_REQUEST).mergeMap((action: any) => {
    if (!action.$$responseChannel) return Rx.Observable.of(null)

    const [_id, promise] = bolt.routedWriteTransaction(
      action.query,
      action.params,
      {
        ...getUserTxMetadata(action.queryType || null),
        cancelable: true,
        useDb: action.useDb
      }
    )

    return routedCypherQueryResultResolver(action, promise)
  })

export const adHocCypherRequestEpic = (some$: any, store: any) =>
  some$.ofType(AD_HOC_CYPHER_REQUEST).mergeMap((action: any) => {
    const connection = getActiveConnectionData(store.getState())
    const tempConnection = {
      ...connection,
      host: action.host
    }
    return callClusterMember(tempConnection, action)
  })

export const clusterCypherRequestEpic = (some$: any, store: any) =>
  some$
    .ofType(CLUSTER_CYPHER_REQUEST)
    .mergeMap((action: any) => {
      if (!action.$$responseChannel) return Rx.Observable.of(null)
      return bolt
        .directTransaction(getClusterAddresses, {}, userActionTxMetadata)
        .then((res: any) => {
          const addresses = flatten(
            res.records.map((record: any) => record.get('addresses'))
          ).filter((address: any) => address.startsWith('bolt://'))
          return {
            action,
            observables: addresses.map((host: any) => {
              const connection = getActiveConnectionData(store.getState())
              const tempConnection = {
                ...connection,
                host
              }
              return Rx.Observable.fromPromise(
                callClusterMember(tempConnection, action)
              )
            })
          }
        })
        .catch((error: any) => {
          return Rx.Observable.of({ action, error })
        })
    })
    .flatMap(({ action, observables, value }: any) => {
      if (value) return Rx.Observable.of(value)
      observables.push(Rx.Observable.of(action))
      return Rx.Observable.forkJoin(...observables)
    })
    .map((value: any) => {
      if (value && value.error) {
        return {
          type: value.action.$$responseChannel,
          success: false,
          error: value.error
        }
      }
      const action = value.pop()
      const records = value.reduce(
        (acc: any, { result, success, error, host }: any) => {
          if (!success) {
            return [
              {
                error: {
                  host,
                  message: error.message,
                  code: error.code
                }
              }
            ]
          }
          const mappedRes = result.records.map((record: any) => ({
            ...record,
            host: result.summary.server.address
          }))
          return [...acc, ...mappedRes]
        },
        []
      )
      return {
        type: action.$$responseChannel,
        success: true,
        result: { records }
      }
    })
