export enum InitiativeCallbackAction {
  EDIT_INITIATIVE_DIALOG = 'EDIT_INITIATIVE_DIALOG'
}

export enum InitiativeAction {
  JOIN_AS_MEMBER = 'JOIN_AS_MEMBER',
  JOIN_AS_CHAMPION = 'JOIN_AS_CHAMPION',
  VIEW_DETAILS = 'VIEW_DETAILS',
  UPDATE_STATUS = 'UPDATE_STATUS',
  OPEN_EDIT_DIALOG = 'OPEN_EDIT_DIALOG'
}

export enum MemberAction {
  MAKE_CHAMPION = 'MAKE_CHAMPION',
  MAKE_MEMBER = 'MAKE_MEMBER',
  REMOVE_MEMBER = 'REMOVE_MEMBER'
}

export enum StatusUpdateAction {
  MARK_ACTIVE = 'MARK_ACTIVE',
  MARK_ON_HOLD = 'MARK_ON_HOLD',
  MARK_COMPLETE = 'MARK_COMPLETE',
  MARK_ABANDONED = 'MARK_ABANDONED'
}
