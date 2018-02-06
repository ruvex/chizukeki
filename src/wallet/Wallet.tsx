import * as React from 'react'
import { Dimensions, View, ViewStyle, Clipboard } from 'react-native'
import PrivateKey from './LoadPrivateKey'
import TransactionList from './Transaction'
import SendTransaction from './SendTransaction'
import { Button, CardItem, Body, Text, Card, connectStyle, H2, Icon } from 'native-base/src/index'

import Wrapper from '../generics/Wrapper'
import RoutineButton from '../generics/routine-button'
import Modal from '../generics/modal.web'

import { Wallet as WalletData } from './explorerApi/common'

import { WrapActionable } from './UnlockModal'

class Toggleable extends React.Component<any> {
  render() {
    let { toggle = () => { }, active = false, children, ...props } = this.props
    return (
      <Button {...active ? { primary: true } : { light: true }} {...props} onClick={toggle}>
        {children}
      </Button>
    )
  }
}

class UnlockThenCopy extends React.Component<{ keys: Wallet.Keys }, { privateKey: string }> {
  state = { privateKey: '' }
  cache = (privateKey: string) => 
    this.setState({ privateKey })
  copy = () => {
    let success = Clipboard.setString(this.state.privateKey)
    this.setState({ privateKey: '' })
    return success
  }
  render() {
    return [
      <Modal key='modal' open={this.state.privateKey} onClose={this.copy}>
        <Text> Unlocked! </Text>
        <Button iconLeft success style={styles.column} onPress={this.copy}>
          <Text> Copy Key to Clipboard </Text>
        </Button>
      </Modal>,
      <WrapActionable.IfLocked
        key='button'
        keys={this.props.keys}
        actionProp='onPress'
        action={Wallet.Keys.areLocked(this.props.keys) ? this.cache : this.copy}
        Component={({ onPress }) =>
          <Button iconLeft light style={styles.column} onPress={onPress}>
            <Icon name='eject'/>
            <Text>Export Key</Text>
          </Button>
        }
      />
    ]
  }
}

function Balance({ balance, ...props }) {
  return (
    <View {...props}>
      <H2>{balance.toLocaleString('en')} PPC</H2>
      <Text note>balance</Text>
    </View>
  )
}

function TransactionCount({ unspentOutputs, ...props }) {
  return (
    <Toggleable {...props}>
      <Text>{unspentOutputs.length} transactions</Text>
    </Toggleable>
  )
}


let styles = {
  main: {
    flex: 3,
    minWidth: 350,
    marginLeft: 15,
    marginRight: 15,
    flexDirection: 'column',
    justifyContent: 'space-around',
    alignItems: 'center',
    overflow: 'hidden',
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%'
  },
  column: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 7.5,
    flex: 1,
  }
}

@connectStyle('PeerKeeper.Wallet', styles)
class Wallet extends React.Component<
  Wallet.Data & {
    style?: any,
    sendTransaction: SendTransaction.Props
    sync: {
      stage: string | undefined,
      enabled: boolean,
      start: () => any,
      stop: () => any,
    }
  }
> {
  componentDidMount() {
    let sync = this.props.sync
    if(sync.enabled){
      sync.start()
    }
  }
  render() {
    let { address, transactions = [], balance = 0, style, keys, sync, sendTransaction } = this.props
    return (
      <Wrapper>
        <View style={style.main}>
          <Card style={{ width: '100%' }}>
            <CardItem header>
              <Balance balance={balance} style={style.column} />
            </CardItem>
            <CardItem>
              <Body style={style.body}>
                <UnlockThenCopy keys={keys}/>
                <RoutineButton style={style.column}
                  autoDismiss={{ stage: 'DONE' }}
                  icons={{ DEFAULT: 'refresh', DONE: 'refresh' }}
                  warning={!sync.enabled}
                  onPress={sync.enabled ? sync.stop : sync.start}
                  stage={sync.stage}
                  DEFAULT={ sync.enabled ? 'Syncing' : 'Sync Disabled' }
                  LOADING='Syncing'
                  FAILED='Sync Failed' />
              </Body>
            </CardItem>
          </Card>
          <SendTransaction style={style.card} {...sendTransaction} />
        </View>
        <TransactionList transactions={transactions} />
      </Wrapper>
    )
  }
}

type _Keys = _Keys.Locked | _Keys.Unlocked
namespace _Keys {
  type WithFormat = {
    format: PrivateKey.Data['format'],
  }
  export type Locked = WithFormat & { locked: string }
  export type Unlocked = WithFormat & { private: string }
  export function areLocked(keys: _Keys): keys is Locked {
    return keys.hasOwnProperty('locked')
  }
}

namespace Wallet {
  export type Transaction = WalletData.Transaction
  export type PendingTransaction = WalletData.PendingTransaction

  export type Keys = _Keys
  export const Keys = _Keys
  export type Loading = {
    address: string,
    keys: Keys
  }

  export type Synced = WalletData
  export type Data = Loading & Synced
  export type Unlocked = Data & { privateKey: string }
  export function isLoaded(wallet: Loading | Data | undefined): wallet is Data {
    return Boolean(wallet && wallet.hasOwnProperty('_meta'))
  }
}

export default Wallet