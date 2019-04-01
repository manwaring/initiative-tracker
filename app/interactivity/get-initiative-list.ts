import { ActionPayload, Message } from 'slack';
import { ListResponse } from '../slack-messages';
import { getInitiatives, getQuery } from '../slash-commands/list-initiatives';

export async function getInitiativeListAction(
  teamId: string,
  channelId: string,
  queryId: string,
  payload: ActionPayload
): Promise<Message> {
  const query = await getQuery(queryId);
  const slackUserId = payload.user.id;
  const initiatives = await getInitiatives(teamId, query);
  return new ListResponse({ initiatives, channelId, slackUserId, query });
}
