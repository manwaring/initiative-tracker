import { DynamoDB } from 'aws-sdk';
import { apiWrapper, ApiSignature } from '@manwaring/lambda-wrapper';
import { Message, Payload, Dialog } from 'slack';
import { InitiativeCallbackAction, InitiativeAction, MemberAction, StatusUpdateAction } from './interactions';
import {
  CreateMemberRequest,
  MEMBER_TYPE,
  MemberResponse,
  DeleteMemberRequest,
  getTeamIdentifier,
  getMemberIdentifiers
} from './member';
import { INITIATIVE_TYPE, InitiativeRecord, InitiativeResponse, Status, getInitiativeIdentifiers } from './initiative';
import { DetailResponse } from './slack-responses/detail-response';
import {
  EditInitiativeDialogResponse,
  EditInitiativeFieldValidator
} from './slack-responses/edit-initiative-dialogue-response';
import { sendDialogue, dialogErrorReply } from './slack/dialogues';
import { getUserProfile } from './slack/profile';
import { NotImplementedResponse } from './slack-responses/not-implemented-response';
import { reply } from './slack/messages';

const initiatives = new DynamoDB.DocumentClient({ region: process.env.REGION });

export const handler = apiWrapper(async ({ body, success, error }: ApiSignature) => {
  try {
    console.log('body', body);
    console.log('pl', body.payload);
    const payload: Payload = JSON.parse(body.payload);
    const teamId = payload.team.id;
    const responseUrl = payload.response_url;
    const channel = payload.channel.id;
    const action = payload.actions ? payload.actions[0].action_id : payload.callback_id;
    const triggerId = payload.trigger_id;
    let dialogResponse = false;
    let dialogError = false;
    let response: Message | EditInitiativeDialogResponse | EditInitiativeFieldValidator;
    switch (action) {
      case InitiativeAction.JOIN_AS_MEMBER:
      case InitiativeAction.JOIN_AS_CHAMPION: {
        const { initiativeId, champion } = JSON.parse(payload.actions[0].value);
        const slackUserId = payload.user.id;
        await joinInitiative(teamId, initiativeId, slackUserId, champion);
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new DetailResponse(initiative, slackUserId, channel);
        break;
      }
      case InitiativeAction.VIEW_DETAILS: {
        const { initiativeId } = JSON.parse(payload.actions[0].value);
        const slackUserId = payload.user.id;
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new DetailResponse(initiative, slackUserId, channel);
        break;
      }
      case InitiativeAction.OPEN_EDIT_DIALOG: {
        dialogResponse = true;
        const { initiativeId } = JSON.parse(payload.actions[0].value);
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new EditInitiativeDialogResponse(initiative, triggerId);
        break;
      }
      case MemberAction.MAKE_CHAMPION: {
        const { initiativeId, slackUserId } = JSON.parse(payload.actions[0].value);
        await changeMembership(initiativeId, teamId, slackUserId, true);
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new DetailResponse(initiative, slackUserId, channel);
        break;
      }
      case MemberAction.MAKE_MEMBER: {
        const { initiativeId, slackUserId } = JSON.parse(payload.actions[0].value);
        await changeMembership(initiativeId, teamId, slackUserId, false);
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new DetailResponse(initiative, slackUserId, channel);
        break;
      }
      case MemberAction.REMOVE_MEMBER: {
        const { initiativeId, slackUserId } = JSON.parse(payload.actions[0].value);
        await leaveInitiative(initiativeId, teamId, slackUserId);
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new DetailResponse(initiative, slackUserId, channel);
        break;
      }
      case InitiativeCallbackAction.EDIT_INITIATIVE_DIALOG: {
        const slackUserId = payload.user.id;
        const { initiative_name, initiative_description } = payload.submission;
        const { originalName, originalDescription, initiativeId } = JSON.parse(payload.state);
        const fieldValidator = new EditInitiativeFieldValidator(
          initiative_name,
          initiative_description,
          originalName,
          originalDescription
        );
        if (fieldValidator.errors.length > 0) {
          response = fieldValidator;
          dialogError = true;
        } else {
          await updateInitiativeNameAndDescription(
            teamId,
            initiativeId,
            originalName !== initiative_name && initiative_name,
            originalDescription !== initiative_description && initiative_description
          );
          const initiative = await getInitiativeDetails(teamId, initiativeId);
          response = new DetailResponse(initiative, slackUserId, channel);
        }
        break;
      }
      case InitiativeAction.UPDATE_STATUS:
      case StatusUpdateAction.MARK_ON_HOLD:
      case StatusUpdateAction.MARK_ABANDONED:
      case StatusUpdateAction.MARK_COMPLETE:
      case StatusUpdateAction.MARK_ACTIVE: {
        const value = payload.actions[0].value ? payload.actions[0].value : payload.actions[0].selected_option.value;
        const { initiativeId, status } = JSON.parse(value);
        const slackUserId = payload.user.id;
        await updateInitiativeStatus(initiativeId, teamId, status);
        const initiative = await getInitiativeDetails(teamId, initiativeId);
        response = new DetailResponse(initiative, slackUserId, channel);
        break;
      }
      default: {
        response = new NotImplementedResponse(channel);
        break;
      }
    }
    if (dialogError) {
      // await dialogErrorReply(responseUrl, response as EditInitiativeFieldValidator)
      success(response)
    } else {
    if (dialogResponse) {
      await sendDialogue(teamId, response);
    } 
    else {
      await reply(responseUrl, response as Message);
    }
    success();
  }
  } catch (err) {
    error(err);
  }
});

// async function updateInitiativeNameAndDescriptionHandler(payload: any): Promise<any> {
//   const initiativeId: string = payload.actions[0].value;
//   const update = new UpdateInitiativeRequest({
//     updateInitiativeId: initiativeId,
//     newName: payload.initiative.name,
//     newDescription: payload.initiative.description
//   });
//   await updateInitiativeNameAndDescription(update);
//   const message = {
//     text: `Initiative ${
//       update.name && update.description
//         ? `name updated to ${update.name} and description updated to ${update.description}`
//         : update.name
//         ? `name updated to ${update.name}`
//         : `description updated to ${update.description}`
//     }!`,
//     response_type: 'in_channel'
//   };
//   return message;
// }

function updateInitiativeNameAndDescription(
  teamId: string,
  initiativeId: string,
  initiativeName: string,
  initiativeDescription: string
): Promise<any> {
  let UpdateExpression = 'set ';
  let ExpressionAttributeNames = {};
  let ExpressionAttributeValues = {};
  if (initiativeName) {
    UpdateExpression = UpdateExpression.concat('#name = :name');
    ExpressionAttributeNames['#name'] = 'name';
    ExpressionAttributeValues[':name'] = initiativeName;
  }
  if (initiativeDescription) {
    UpdateExpression = UpdateExpression.concat(
      UpdateExpression.length > 4 ? ', #description = :description' : '#description = :description'
    );
    ExpressionAttributeNames['#description'] = 'description';
    ExpressionAttributeValues[':description'] = initiativeDescription;
  }
  const params = {
    TableName: process.env.INITIATIVES_TABLE,
    Key: { initiativeId, identifiers: getInitiativeIdentifiers(teamId) },
    UpdateExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues
  };
  console.log('Updating Initiative Name and/or Description', params);
  return initiatives.update(params).promise();
}

async function updateInitiativeStatus(initiativeId: string, teamId: string, status: Status): Promise<any> {
  const params = {
    TableName: process.env.INITIATIVES_TABLE,
    Key: { initiativeId, identifiers: getInitiativeIdentifiers(teamId) },
    UpdateExpression: 'set #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status }
  };
  console.log('Updating initiative status with params', params);
  await initiatives.update(params).promise();
}

async function joinInitiative(
  teamId: string,
  initiativeId: string,
  slackUserId: string,
  champion: boolean
): Promise<any> {
  const { name, icon } = await getUserProfile(slackUserId, teamId);
  const member = new CreateMemberRequest({ teamId, initiativeId, slackUserId, name, champion, icon });
  const params = { TableName: process.env.INITIATIVES_TABLE, Item: member };
  console.log('Adding member to initiative with params', params);
  await initiatives.put(params).promise();
}

async function changeMembership(
  initiativeId: string,
  teamId: string,
  slackUserId: string,
  champion: boolean
): Promise<any> {
  const params = {
    TableName: process.env.INITIATIVES_TABLE,
    Key: { initiativeId, identifiers: getMemberIdentifiers(teamId, slackUserId) },
    UpdateExpression: 'set #champion = :champion',
    ExpressionAttributeNames: { '#champion': 'champion' },
    ExpressionAttributeValues: { ':champion': champion }
  };
  console.log('Updating membership type with params', params);
  await initiatives.update(params).promise();
}

function leaveInitiative(initiativeId: string, teamId: string, slackUserId: string): Promise<any> {
  const Key = new DeleteMemberRequest({ initiativeId, teamId, slackUserId });
  const params = { TableName: process.env.INITIATIVES_TABLE, Key };
  console.log('Removing member from initiative with params', params);
  return initiatives.delete(params).promise();
}

async function getInitiativeDetails(teamId: string, initiativeId: string): Promise<InitiativeResponse> {
  const params = {
    TableName: process.env.INITIATIVES_TABLE,
    KeyConditionExpression: '#initiativeId = :initiativeId and begins_with(#identifiers, :identifiers)',
    ExpressionAttributeNames: { '#initiativeId': 'initiativeId', '#identifiers': 'identifiers' },
    ExpressionAttributeValues: { ':initiativeId': initiativeId, ':identifiers': getTeamIdentifier(teamId) }
  };
  console.log('Getting initiative details with params', params);
  const records = await initiatives
    .query(params)
    .promise()
    .then(res => <InitiativeRecord[]>res.Items);
  console.log('Received initiative records', records);
  let initiative: InitiativeResponse = new InitiativeResponse(records.find(record => record.type === INITIATIVE_TYPE));
  initiative.members = records.filter(record => record.type === MEMBER_TYPE).map(record => new MemberResponse(record));
  return initiative;
}
