<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Service;

use OCA\FeatureVoting\Db\Feature;
use OCA\FeatureVoting\Db\FeatureMapper;
use OCA\FeatureVoting\Db\Vote;
use OCA\FeatureVoting\Db\VoteMapper;
use OCP\AppFramework\Db\DoesNotExistException;

class FeatureService {
    public function __construct(
        private readonly FeatureMapper $featureMapper,
        private readonly VoteMapper $voteMapper,
    ) {
    }

    /** @return array{features: Feature[], votedIds: int[]} */
    public function getAll(string $userId): array {
        return [
            'features' => $this->featureMapper->findAll(),
            'votedIds' => $this->voteMapper->findVotedFeatureIds($userId),
        ];
    }

    public function create(string $title, string $description, string $userId): Feature {
        $feature = new Feature();
        $feature->setTitle(trim($title));
        $feature->setDescription(trim($description));
        $feature->setUserId($userId);
        $feature->setVoteCount(0);
        $feature->setCreatedAt((new \DateTime())->format('Y-m-d H:i:s'));
        return $this->featureMapper->insert($feature);
    }

    /**
     * Toggle vote: returns true if voted, false if unvoted.
     */
    public function toggleVote(int $featureId, string $userId): bool {
        $existing = $this->voteMapper->findByFeatureAndUser($featureId, $userId);

        if ($existing !== null) {
            $this->voteMapper->delete($existing);
            $this->featureMapper->decrementVote($featureId);
            return false;
        }

        $vote = new Vote();
        $vote->setFeatureId($featureId);
        $vote->setUserId($userId);
        $this->voteMapper->insert($vote);
        $this->featureMapper->incrementVote($featureId);
        return true;
    }

    public function delete(int $featureId, string $userId): void {
        $feature = $this->featureMapper->findById($featureId);
        if ($feature->getUserId() !== $userId) {
            throw new \RuntimeException('Not allowed');
        }
        $this->featureMapper->delete($feature);
    }
}
