import connect from "../../../../renderer/screens/helpers/connect";
import React, { Component } from "react";
import { hashHistory } from "react-router";
import jsonTheme from "../../../../common/utils/jsonTheme";
import ReactJson from "@seesemichaelj/react-json-view";
import NodeLink from "../components/NodeLink";
import TransactionData from "../transaction-data";


// TODO: linearId deletion might be temporary
// I'm only removing it right now because it can contain a `null` which react-json-view can't handle (crashes)
// We need to fix this here once https://www.npmjs.com/package/@seesemichaelj/react-json-view is fixed.
const IGNORE_FIELDS = ["@class", "participants", "linearId"];

function getCleanState(state) {
  const data = state.state.data;
  const cleanState = {};
  for (const key in data) {
    if (IGNORE_FIELDS.includes(key)) continue;
    cleanState[key] = data[key];
  }
  return cleanState;
}

class Transaction extends Component {
  refresher = {cancel: ()=>{}};

  constructor(props) {
    super(props);

    this.state = {transaction: null};
  }

  componentWillUnmount() {
    this.refresher.cancel();
  }

  componentDidMount(){
    this.refresh();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.config.updated !== this.props.config.updated) {
      // if the data has updated let's refresh the transaction just in case
      // things have changed.
      this.refresh();
    } else if (prevProps.params.txhash !== this.props.params.txhash) {
      // if the txhash has changed we first want to trigger the loading screen
      // by getting rid of the current `transaction` then we need to refresh our data
      this.setState({transaction: null}, this.refresh.bind(this));
    }
  }

  async refresh() {
    // I not ready to commit to redux thunks for this stuff just yet
    // so a little async canceller will have to do
    this.refresher.cancel();

    let canceller = {cancelled: false};
    this.refresher = {
      cancel: () => {canceller.cancelled = true}
    };
    
    const port = this.props.config.settings.workspace.postgresPort;
    const nodes = this.props.config.settings.workspace.nodes;
    const txhash = this.props.params.txhash;

    const transaction = new TransactionData(txhash);
    await transaction.update(nodes, port, canceller);
    if (canceller.cancelled) return;

    this.setState({transaction});
  }

  render() {
    const transaction = this.state.transaction;
    if (!transaction) {
      return (<div>Loading...</div>);
    }

    const txStates = transaction.states;
    if (txStates.size === 0) {
      return (<div>Couldn&apos;t locate transaction {this.props.params.txhash}</div>);
    }

    const states = [];
    for (let [index, state] of txStates) {
      const txData = getCleanState(state);

      const participants = state.state.data.participants || [];
      const workspaceNotary = this.getWorkspaceNotary(state.state.notary.owningKey);
      const meta = state.metaData;
      states.push(<div key={state + index}>
        <hr />
        <div>
          <h3>Contract</h3>
          <div>{state.state.contract}</div>
        </div>
        <h3>{meta.status} State ({index})</h3>
        <ReactJson
          src={
            txData
          }
          name={false}
          theme={jsonTheme}
          iconStyle="triangle"
          edit={false}
          add={false}
          delete={false}
          enableClipboard={false}
          displayDataTypes={true}
          displayObjectSize={true}
          indentWidth={4}// indent by 4 because that's what Corda likes to do.
          collapsed={1}
          collapseStringsAfterLength={20}
        />
        <br/>
        {state.state.data.exitKeys && state.state.data.exitKeys.length !== 0 ? (
          <>
            <h3>Signers</h3>
            {state.state.data.exitKeys.map(key => {
              const workspaceNode = this.getWorkspaceNode(key);
              if (workspaceNode) {
                return (<NodeLink key={"participant_" + workspaceNode.safeName} postgresPort={this.props.config.settings.workspace.postgresPort} node={workspaceNode} />);
              }
            })}
            <br/>
          </>
        ) : ("")}
        {!workspaceNotary ? "" : <>
            <div>
              <h3>Notary</h3>
              <div>{<NodeLink node={workspaceNotary} postgresPort={this.props.config.settings.workspace.postgresPort} />}</div>
            </div>
            <br/>
          </>
        }
        <div>
          <h3>Timestamp</h3>
          <div>{meta.recordedTime}</div>
        </div>
        <br/>
        {!participants.length ? "" :
        <div>
          <h3>Participants</h3>
          <div>
            {participants.map(node => {
              const workspaceNode = this.getWorkspaceNode(node.owningKey);
              if (workspaceNode) {
                return (<NodeLink key={"participant_" + workspaceNode.safeName} postgresPort={this.props.config.settings.workspace.postgresPort} node={workspaceNode} />);
              } else {
                return (<div key={"participant_anon" + node.owningKey}>Anonymized Participant</div>);
              }
            })}
          </div>
          <br/>
        </div>}
        {!state.observers.size ? "" :
          <div>
            <h3>Known By</h3>
            <div>
              {[...state.observers].map(node => {
                return (<NodeLink key={"participant_" + node.safeName} postgresPort={this.props.config.settings.workspace.postgresPort} node={node} />);
              })}
            </div>
          </div>}
        </div>
      );
    }
    return (
      <div className="Nodes DataRows">
        <main>
          <div>
            <button className="Button" onClick={hashHistory.goBack}>
              &larr; Back
            </button>
            <div>
              TX {transaction.txhash}
            </div>
            <hr />
            {states}
            <hr />
            <div>
              <h3>Timestamp</h3>
              <div>{transaction.earliestRecordedTime.toString()}</div>
            </div>
          </div>
        </main>
      </div>
    );
  }
  getWorkspaceNodeByType(type, owningKey) {
    return this.props.config.settings.workspace[type].find(node => owningKey === node.owningKey);
  }
  getWorkspaceNode(owningKey) {
    return this.getWorkspaceNodeByType("nodes", owningKey);
  }
  getWorkspaceNotary(owningKey) {
    return this.getWorkspaceNodeByType("notaries", owningKey);
  }
}

export default connect(
  Transaction,
  "config"
);
