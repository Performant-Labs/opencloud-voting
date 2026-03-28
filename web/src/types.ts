export interface Feature {
  id: number
  title: string
  description: string
  userId: string
  voteCount: number
  createdAt: string
}

export interface VoteToggleResponse {
  voted: boolean
  voteCount: number
}

export interface FeatureListResponse {
  features: Feature[]
  votedIds: number[]
}
