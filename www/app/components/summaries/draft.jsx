define(function (require) {
'use strict';

var React = require('react');
var PureRenderMixin = require('react-addons-pure-render-mixin');

var FormattedMessage = require('react-intl').FormattedMessage;

var ComposePeep = require('../actioners/compose_peep');
var ComposePeepAdder = require('../actioners/compose_peep_adder');
var ComposeAttachment = require('../actioners/compose_attachment');

var embodyHTML = require('gelam/clientapi/bodies/embody_html');

var MediumEditor = require('../medium_editor');

const draftScopedStyle = `
p:first-child { margin-block-start: 0; }
p:last-child { margin-block-end: 0; }
`;

/**
 * Editable message draft, intended to be used where you'd otherwise display
 * a MessageSummary (using conditionalWidget).  Automatically acquires a
 * `MessageComposition` instance when bound, at which point we can render
 * ourselves.
 *
 * The state maintenance idiom could potentially be improved.  For now we store
 * canonical state in the MessageComposition instance since this simplifies
 * initial population.  We don't bother maintaining a serial number on the
 * composer and instead just forceUpdate.
 */
var DraftSummary = React.createClass({
  mixins: [PureRenderMixin],

  getInitialState: function() {
    return {
      composer: null,
      serial: 0,
      dirty: false
    };
  },

  _getComposer: function() {
    this.dirtiedBodyRetriever = null;
    this.props.item.editAsDraft().then((composer) => {
      composer.on('change', () => {
        this.setState({
          serial: composer.serial,
          dirty: true
        });
      });
      this.setState({ composer });
      if (composer.htmlBlob) {
        embodyHTML(composer.htmlBlob,
                   React.findDOMNode(this.refs.immutableHtml));
      }
    });
  },

  componentDidMount: function() {
    this._getComposer();
  },

  componentWillUnmount: function() {
    if (this.state.composer) {
      this.state.composer.release();
    }
  },

  componentWillReceiveProps: function(nextProps) {
    // Assert that our message never changes.
    if (nextProps.item !== this.props.item) {
      throw new Error('Our message must never change!');
    }
  },

  render: function() {
    var composer = this.state.composer;
    if (!composer) {
      return <div></div>;
    }
    var api = composer.api;

    let makeRecipRow = (bin, l10nId) => {
      let composePeeps = composer[bin].map((nameAddrPair) => {
        return (
          <ComposePeep key={ nameAddrPair.address }
                       bin={ bin }
                       composer={ composer }
                       peep={ nameAddrPair } />
        );
      });

      return (
        <div className="draft-recip-row">
          <span className="draft-recip-bin-label">
            <FormattedMessage id={ l10nId } />
          </span>
          { composePeeps }
          <ComposePeepAdder
            bin={ bin }
            composer={ composer }
            api={ api }
            />
        </div>
      );
    };

    let attachments = composer.attachments.map((attachment, idx) => {
      // ugh, using the index as a key, but we desperately need an id on these
      // things.
      return (
        <ComposeAttachment key={ idx }
                           composer={ composer }
                           attachment={ attachment } />
      );
    });

    let mediumOptions = {
      placeholder: false,
    };

    let displayNone = {
      display: 'none'
    };

    let dirtyMessage = this.state.dirty ? 'composeDirtyUnsaved'
                                        : 'composeCleanSaved';

    return (
      <div className="draft-item">
        <div className="draft-envelope-container">
          { makeRecipRow('to', 'composeLabelTo') }
          { makeRecipRow('cc', 'composeLabelCc') }
          { makeRecipRow('bcc', 'composeLabelBcc') }
          <div className="draft-subject-row">
            <input className="draft-subject"
                   type="text"
                   value={ composer.subject }
                   onChange={ this.subjectChange } />
          </div>
          <div className="draft-attachments">
            { attachments }
          </div>
        </div>

        <div className="draft-body-area">
          <style scoped>{ draftScopedStyle }</style>
          <MediumEditor initialContent={ composer.textBody }
                        onDirty={ this.bodyDirtied }
                        options={ mediumOptions } />
          <div ref="immutableHtml" />
        </div>
        <div className="draft-buttons">
          <button onClick={ this.sendMessage }>
            <FormattedMessage
              id='composeSend' />
          </button>
          <input ref="file"
                 type="file"
                 style={ displayNone }
                 onChange={ this.attachFile }></input>
          <button onClick={ this.triggerAttach }>
            <FormattedMessage
              id='composeAttach' />
          </button>
          <button onClick={ this.saveDraft }>
            <FormattedMessage
              id='composeSave' />
          </button>
          <span>
            <FormattedMessage
              id='dirtyMessage' />
          </span>
          <button onClick={ this.deleteDraft }>
            <FormattedMessage
              id='composeDiscard' />
          </button>
        </div>
      </div>
    );
  },

  subjectChange: function(event) {
    this.state.composer.setSubject(event.target.value);
  },

  bodyDirtied: function(retrieveFunc) {
    this.dirtiedBodyRetriever = retrieveFunc;
    this.setState({ dirty: true });
  },

  _persistStateToComposer: function() {
    if (this.dirtiedBodyRetriever) {
      this.state.composer.textBody = this.dirtiedBodyRetriever();
      this.dirtiedBodyRetriever = null;
    }
  },

  /**
   * type=file inputs are dumb looking, so we have our attach button trigger the
   * actual input under the hood.  Which will cascade through to a call to
   * attachFile below.
   */
  triggerAttach: function() {
    React.findDOMNode(this.refs.file).click();
  },

  /**
   * The actual attachment-attaching logic that `triggerAttach` helps us get to
   * happen.
   */
  attachFile: function(event) {
    var fileInput = event.target;
    Array.from(fileInput.files).forEach((file) => {
      this.state.composer.addAttachment({
        name: file.name,
        blob: file
      });
    });
  },

  deleteDraft: function() {
    this.state.composer.abortCompositionDeleteDraft();
  },

  sendMessage: function() {
    this._persistStateToComposer();
    this.state.composer.finishCompositionSendMessage();
  },

  saveDraft: function() {
    this._persistStateToComposer();
    this.state.composer.saveDraft();
    this.setState({ dirty: false });
  }
});

return DraftSummary;
});
