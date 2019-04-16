import { apiWrapper, ApiSignature } from '@manwaring/lambda-wrapper';
import { label, metric } from '@iopipe/iopipe';
import { Message, ActionPayload } from 'slack';
import { InitiativeAction, MemberAction, ListAction } from './interactions';
import { replyWithMessage, getAndSaveUserProfile } from '../slack-api';
import { NotImplementedResponse } from '../slack-messages';
import { joinInitiativeAction } from './join-initiative';
import { getInitiativeDetailsAction } from './get-initiative-details';
import { updateStatusAction } from './update-status';
import { editInitiativeAction } from './edit-initiative';
import { remainMemberAction } from './remain-member';
import { parseValue, Value } from './id-helper';
import { deleteInitiativeAction } from './delete-initiative';
import { openEditDialogAction } from './open-edit-dialog';
import { changeMembershipAction } from './change-membership';
import { leaveInitiativeAction } from './leave-initiative';
import { openAddMemberDialogAction } from './open-add-member-dialog';
import { addMemberAction } from './add-member';
import { getInitiativeListAction } from './get-initiative-list';
import { ThankYouResponse } from '../slack-messages/thank-you';

export const handler = apiWrapper(async ({ body, success, error }: ApiSignature) => {
  try {
    let response: Message;
    let { payload, teamId, responseUrl, channel, action, triggerId } = getFieldsFromBody(body);
    const profile = await getAndSaveUserProfile(payload.user.id, teamId);
    switch (action) {
      case InitiativeAction.VIEW_DETAILS: {
        response = await getInitiativeDetailsAction(teamId, channel, payload);
        break;
      }
      case ListAction.FILTER_BY_OFFICE:
      case ListAction.FILTER_BY_STATUS:
      case InitiativeAction.VIEW_LIST: {
        response = await getInitiativeListAction(teamId, channel, payload, profile);
        break;
      }
      case InitiativeAction.DELETE: {
        response = await deleteInitiativeAction(teamId, channel, payload);
        break;
      }
      case InitiativeAction.OPEN_EDIT_DIALOG: {
        await openEditDialogAction(teamId, channel, payload, triggerId, responseUrl);
        break;
      }
      case InitiativeAction.EDIT_INITIATIVE: {
        ({ response, responseUrl } = await editInitiativeAction(teamId, channel, payload));
        break;
      }
      case InitiativeAction.OPEN_ADD_MEMBER_DIALOG: {
        await openAddMemberDialogAction(teamId, channel, payload, triggerId, responseUrl);
        break;
      }
      case InitiativeAction.ADD_MEMBER: {
        ({ response, responseUrl } = await addMemberAction(teamId, channel, payload, profile));
        break;
      }
      case InitiativeAction.UPDATE_STATUS: {
        response = await updateStatusAction(teamId, channel, payload);
        break;
      }
      case InitiativeAction.MARK_ON_HOLD:
      case InitiativeAction.MARK_ABANDONED:
      case InitiativeAction.MARK_COMPLETE:
      case InitiativeAction.MARK_ACTIVE: {
        await updateStatusAction(teamId, channel, payload);
        response = new ThankYouResponse(channel);
        break;
      }
      case InitiativeAction.JOIN_AS_MEMBER:
      case InitiativeAction.JOIN_AS_CHAMPION: {
        response = await joinInitiativeAction(teamId, channel, payload, profile);
        break;
      }
      case MemberAction.REMOVE_MEMBER: {
        response = await leaveInitiativeAction(teamId, channel, payload);
        break;
      }
      case MemberAction.MAKE_CHAMPION:
      case MemberAction.MAKE_MEMBER: {
        response = await changeMembershipAction(teamId, channel, payload);
        break;
      }
      case MemberAction.REMAIN_MEMBER: {
        response = await remainMemberAction(teamId, channel, payload);
        break;
      }
      default: {
        response = new NotImplementedResponse(channel);
        break;
      }
    }
    if (response) {
      await replyWithMessage(responseUrl, response as Message);
    }
    success();
  } catch (err) {
    error(err);
  }
});

function getFieldsFromBody(body: any) {
  const payload: ActionPayload = JSON.parse(body.payload);
  const teamId = payload.team.id;
  const responseUrl = payload.response_url;
  const channel = payload.channel.id;
  const action = getAction(payload);
  const triggerId = payload.trigger_id;
  return { payload, teamId, responseUrl, channel, action, triggerId };
}

function getAction(payload: ActionPayload): InitiativeAction | MemberAction | ListAction {
  const callbackAction = payload.callback_id;
  const buttonAction = payload.actions && payload.actions.length > 0 && payload.actions[0].action_id;
  const option = getOption(payload);
  const action = (option && option.action) || buttonAction || callbackAction;
  console.log('Action', action);
  label(action);
  metric('action', action);
  return action;
}

function getOption(payload: ActionPayload): Value {
  let option: Value;
  try {
    option =
      payload.actions &&
      payload.actions.length &&
      payload.actions[0].selected_option &&
      payload.actions[0].selected_option.value &&
      parseValue(payload.actions[0].selected_option.value);
  } catch (err) {}
  return option;
}
