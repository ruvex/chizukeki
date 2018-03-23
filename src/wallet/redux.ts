import PrivateKey from './LoadPrivateKey'
import Wallet from './Wallet'

import { trackRoutineStages } from '../generics/utils'
import saga, { syncWallet, sendTransaction } from './saga'
import { AnyAction } from 'typescript-fsa';
import { init } from 'ramda';

import { sendAssets, spawnDeck } from '../assets/saga'

const routines = {
  sync: syncWallet.routine,
  sendTransaction: sendTransaction.routine
}

type Stages = { routineStages: { [key in keyof typeof routines]: string | undefined } }

export type State = { wallet: null | Wallet.Loading | Wallet.Data } & Stages

let initialState = () => ({
  wallet: null,
  routineStages: {
    sync: undefined,
    sendTransaction: undefined
  }
})
function optimisticallyCacheUnspentOutputs(
  unspentOutputs: Wallet.Data['unspentOutputs'],
  raw: Wallet.Transaction['raw'] = { vout: [], vin: [] }
): Wallet.Data['unspentOutputs'] {
  // TODO vin typing still sloppy
  let consumed = raw.vin.map(i => i.prevTxId) 
  return [
    ...unspentOutputs.filter(utxo => !consumed.includes(utxo.txid)),
    raw.vout[raw.vout.length - 1]
  ]
}

function applyTransaction(
  { balance, unspentOutputs, transactions, _meta, ...wallet }: Wallet.Data,
  { amount, ...transaction }: Wallet.PendingTransaction
): Wallet.Data {
  balance = balance - amount
  return {
    ...wallet,
    _meta: {
      ..._meta,
      updated: new Date(),
      syncState: 'OPTIMISTICALLY_PENDING'
    },
    unspentOutputs: optimisticallyCacheUnspentOutputs(unspentOutputs, transaction.raw),
    balance,
    transactions: [
      { balance, amount: - amount, confirmations: 0, ...transaction },
      ...transactions
    ]
  }
}

function stillPendingTransactions(
  old: Array<Wallet.Transaction>,
  synced: Array<Wallet.Transaction>
){
  let syncedIds = synced.map(t => t.id)
  return old.filter(t => !syncedIds.includes(t.id))
}

function byTimestampDesc(a: Wallet.Transaction, b: Wallet.Transaction){
  return (b.timestamp || new Date()).getTime() - (a.timestamp || new Date()).getTime()
}

function applySync({ old, synced: { _meta, transactions, unspentOutputs, ...synced } }: {
  old: Wallet.Loading | Wallet.Data,
  synced: Wallet.Synced,
}): Wallet.Data {
  let stillPending = stillPendingTransactions(
    Wallet.isLoaded(old) ? old.transactions : [],
    transactions
  )
  return {
    ...old,
    ...synced,
    _meta: {
      created: '_meta' in old ? old._meta.created : _meta.updated,
      updated: _meta.updated,
      syncState: stillPending.length ? 'OPTIMISTICALLY_PENDING' : 'DEFAULT'
    },
    unspentOutputs: stillPending.length && 'unspentOutputs' in old ?
      old.unspentOutputs : unspentOutputs,
    transactions: [ ...stillPending, ...transactions ].sort(byTimestampDesc)
  }
}

function logout(state: State){
  return initialState()
}

function walletReducer(state: State = initialState(), action: AnyAction): State {
  let transactionSwitch = {
    started: payload => state,
    done: (payload) => ({
      ...state,
      // an unloaded wallet here shouldn't be possible
      wallet: Wallet.isLoaded(state.wallet) ? applyTransaction(state.wallet, payload) : state.wallet,
    }),
    failed: () => state
  }
  return syncWallet.routine.switch<State>(action, {
    started: payload => {
      if(!payload.keys){
        return state
      }
      if(!state.wallet){
        return {
          ...state,
          wallet: payload as Wallet.Loading
        }
      }
      return state
    },
    done: (payload) => ({
      ...state,
      wallet: state.wallet ? applySync({ old: state.wallet, synced: payload }) : state.wallet
    }),
    failed: () => state,
    stopped: () => state,
  }) ||
  sendTransaction.routine.switch<State>(action, transactionSwitch) ||
  sendAssets.routine.switch<State>(action, transactionSwitch) ||
  spawnDeck.routine.switch<State>(action, transactionSwitch) ||
  ((action.type === 'HARD_LOGOUT') ? logout(state) : state)
}

export const reducer = trackRoutineStages(routines, 'routineStages')(walletReducer)
export { saga, routines }
