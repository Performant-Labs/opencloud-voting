export interface Feature {
  id: string
  title: string
  description: string
  userId: string
  voteCount: number
  createdAt: string
}

export interface FeatureWithVoted extends Feature {
  voted: boolean
}

export interface VotingData {
  features: Feature[]
  votes: Record<string, string[]> // featureId → array of userIds
}
