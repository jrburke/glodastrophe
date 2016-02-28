define(function(require) {
'use strict';

const mailApi = require('gelam/main-frame-setup');
const { accountIdFromFolderId, accountIdFromConvId } =
  require('gelam/id_conversions');

const { SELECT_ACCOUNT, SELECT_FOLDER, SELECT_CONVERSATION, SELECT_MESSAGE,
        NAVIGATE_TO_DRAFT,
        MODIFY_TEXT_FILTER, MODIFY_FILTER,
        ADD_VIS, MODIFY_VIS, REMOVE_VIS } =
  require('../actions/actionTypes');

const MIN_TEXTFILTER_LEN = 3;

const ACTIONS_WE_CARE_ABOUT = [
  SELECT_ACCOUNT, SELECT_FOLDER, SELECT_CONVERSATION, SELECT_MESSAGE,
  NAVIGATE_TO_DRAFT,
  MODIFY_TEXT_FILTER, MODIFY_FILTER,
  ADD_VIS, MODIFY_VIS, REMOVE_VIS];

/**
 * Given (state.viewing).filtering, create a fresh filter spec suitable for
 * handing to viewFolderConversations/viewConversationMessages.
 */
function buildFilterSpec(filtering) {
  let textFilter = filtering.textFilter;
  let filter = {};
  if (textFilter.filterText) {
    if (textFilter.filterSender) {
      filter.author = textFilter.filterText;
    }
    if (textFilter.filterRecipients) {
      filter.recipients = textFilter.filterText;
    }
    if (textFilter.filterSubject) {
      filter.subject = textFilter.filterText;
    }
    if (textFilter.filterBody) {
      filter.body = textFilter.filterText;
    }
  }
  for (let [filterKey, filterValue] of filtering.otherFilters.items()) {
    filter[filterKey] = filterValue;
  }
  return filter;
}

const DEFAULT_STATE = {
  selections: {
    accountId: null,
    folderId: null,
    conversationId: null,
    messageId: null
  },
  filtering: {
    textFilter: {
      filterText: '',
      filterSender: true,
      filterRecipients: true,
      filterSubject: true,
      filterBody: false
    },
    otherFilters: []
  },
  live: {
    account: null,
    folder: null,
    conversationsView: null,
    conversation: null,
    messagesView: null
  },
  visualizations: {
    conversationsOverview: [],
    conversationsSidebar: [],
    conversationSummary: null,
    conversationOverview: []
  }
};

/**
 * Manages the "viewing" state of the account/folder/conversation/message the
 * user is looking at and any filters.
 *
 * This is primarily an effort to avoid having the conversations/messages panes
 * need to do this state management.  It was okayish before filtering entered
 * the picture and then it all fell apart.
 *
 * It's possible it might be better to implement the speculatively discussed
 * BrowseContext implementation in GELAM-proper.  We'll see how this pans out
 * and whether the redux strategy seems cleaner.  (Once I get the hang of redux,
 * that is.  I am unlikely to get this right the first try.)
 */
return function reduceViewing(oldState = DEFAULT_STATE, action) {
  // Bail if this action doesn't affect us.
  if (ACTIONS_WE_CARE_ABOUT.indexOf(action.type) === -1) {
    return oldState;
  }

  // Do a shallow duplication of our state.  The actions below will clobber
  // these top-level fields as needed.  We do not mutate oldState and we will
  // not mutate newState once we return.  Idiomatically, this isn't the best.
  let newState = Object.assign({}, oldState);

  /**
   * Stateful cleanup and creation of the conversationsView.  This is not the
   * prettiest but it could be worse.
   */
  let ensureConversationsView = () => {
    // See if the old view is still the right view.
    if (oldState.live.conversationsView) {
      // There is an old view.  So check if we've already got a view of the
      // folder and the filter state is the same.
      if (oldState.selections.folderId === newState.selections.folderId &&
          oldState.filtering === newState.filtering ) {
        return oldState.live.conversationsView;
      }
      // nope, kill off the old view.
      oldState.live.conversationsView.release();
    }
    // No view if no folder.
    if (!newState.live.folder) {
      return null;
    }
    // Need a new view.
    if (newState.filtering.textFilter.filterText.length >= MIN_TEXTFILTER_LEN ||
        newState.filtering.otherFilters.size) {
      return mailApi.searchFolderConversations({
        folder: newState.live.folder,
        filter: buildFilterSpec(newState.filtering)
      });
    } else {
      return mailApi.viewFolderConversations(newState.live.folder);
    }
  };

  /**
   * Stateful cleanup and creation of the messagesView.
   */
  let ensureMessagesView = () => {
    // See if the old view is still the right view.
    if (oldState.live.messagesView) {
      // There is an old view.  So check if we've already got a view of the
      // conversation and the filter state is the same.
      if (oldState.selections.conversationId ===
            newState.selections.conversationId &&
          oldState.filtering === newState.filtering ) {
        return oldState.live.messagesView;
      }
      // nope, kill off the old view
      oldState.live.messagesView.release();
    }
    // No view if no conversation.
    if (!newState.live.conversation) {
      return null;
    }
    // Need a new view.
    if (newState.filtering.textFilter.filterText.length >= MIN_TEXTFILTER_LEN ||
        newState.filtering.otherFilters.size) {
      return mailApi.searchConversationMessages({
        conversation: newState.live.conversation,
        filter: buildFilterSpec(newState.filtering)
      });
    } else {
      return mailApi.viewConversationMessages(newState.live.conversation);
    }
  };

  switch (action.type) {
    case SELECT_ACCOUNT: {
      let account = mailApi.accounts.getAccountById(action.accountId);
      let folder = account.folders.getFirstFolderWithType(action.folderType);
      newState.selections = {
        accountId: account.id,
        folderId: folder.id,
        conversationId: null,
        messageId: null
      };
      newState.live = {
        account,
        folder,
        conversationsView: null, // ensure-populated below
        conversation: null,
        messagesView: null // ensured for cleanup below
      };
      break;
    }

    case SELECT_FOLDER: {
      let accountId = accountIdFromFolderId(action.folderId);
      let account = mailApi.accounts.getAccountById(accountId);
      let folder = account.folders.getFolderById(action.folderId);
      newState.selections = {
        accountId: accountId,
        folderId: folder.id,
        conversationId: null,
        messageId: null
      };
      newState.live = {
        account,
        folder,
        conversationsView: null, // ensure-populated below
        conversation: null,
        messagesView: null // ensured for cleanup below
      };
      break;
    }

    case SELECT_CONVERSATION: {
      let oldSelections = oldState.selections;
      newState.selections = {
        accountId: oldSelections.accountId,
        folderId: oldSelections.folderId,
        conversationId: action.conversation.id,
        messageId: null
      };
      let oldLive = oldState.live;
      newState.live = {
        account: oldLive.account,
        folder: oldLive.folder,
        conversationsView: null, // ensure-maintained below
        conversation: action.conversation,
        messagesView: null // ensure-populated below
      };
      break;
    }

    case SELECT_MESSAGE: {
      let oldSelections = oldState.selections;
      newState.selections = {
        accountId: oldSelections.accountId,
        folderId: oldSelections.folderId,
        conversationId: oldSelections.conversationId,
        messageId: action.messageId
      };
      // we leave the `live` intact.  nothing there changed or needs to change.
      break;
    }

    case NAVIGATE_TO_DRAFT: {
      let accountId = accountIdFromConvId(action.conversation.id);
      let account = mailApi.accounts.getAccountById(accountId);
      // NB: This will change when we start storing drafts on the server again.
      // At that point we may want to just pull the draft folder out of
      // the conversation.  (Hardcoding for now because of fear.  FEAR.)
      let folder = account.folders.getFirstFolderWithType('localdrafts');
      newState.selections = {
        accountId: accountId,
        folderId: folder.id,
        conversationId: action.conversation.id,
        messageId: action.draftMessageId
      };
      newState.live = {
        account,
        folder,
        conversationsView: null, // ensure-populated below
        conversation: action.conversation,
        messagesView: null // ensure-populated below
      };
      break;
    }

    case MODIFY_TEXT_FILTER: {
      newState.filtering = {
        textFilter: action.textFilterSpec,
        otherFilters: oldState.filtering.otherFilters
      };
      break;
    }

    case MODIFY_FILTER: {
      let otherFilters = new Map(oldState.filtering.otherFilters);
      for (let [filterKey, filterValue] of action.filterSpecChanges) {
        if (filterValue === null) {
          otherFilters.delete(filterKey);
        } else {
          otherFilters.set(filterKey, filterValue);
        }
      }
      newState.filtering = {
        textFilter: oldState.filtering.textFilter,
        otherFilters: otherFilters
      };
      break;
    }

    case ADD_VIS: {
      break;
    }

    case MODIFY_VIS: {
      break;
    }

    case REMOVE_VIS: {
      break;
    }

    default:
      throw new Error();
  }

  // Ensure views are correct and cleaned up as appropriate.
  // (It's out invariant that our above cases create a new `live` as
  // appropriate.  The (ugly) rationale for this existing like this is due to
  // the fact that the ensure*() methods below access sibling fields in the
  // objects that use object initialization syntax.  That obviously does not
  // work.  Ideas/patches appreciated for how to make this all less ugly.
  if (newState.live !== oldState.live) {
    // TODO: consider how to deal with conversation deletion.  The best solution
    // probably involves the proxy in the back-end maintaining the selection
    // position regardless of the current scroll position.  Which could very
    // possibly be an argument for BrowseContext.
    if (oldState.live.conversation &&
        oldState.live.conversation !== newState.live.conversation) {
      oldState.live.conversation.release();
    }
    newState.live.conversationsView = ensureConversationsView();
    newState.live.messagesView = ensureMessagesView();
  }

  return newState;
};
});
