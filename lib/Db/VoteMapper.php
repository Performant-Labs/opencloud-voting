<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class VoteMapper extends QBMapper {
    public const TABLE_NAME = 'featurevoting_votes';

    public function __construct(IDBConnection $db) {
        parent::__construct($db, self::TABLE_NAME, Vote::class);
    }

    public function findByFeatureAndUser(int $featureId, string $userId): ?Vote {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('feature_id', $qb->createNamedParameter($featureId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        try {
            return $this->findEntity($qb);
        } catch (DoesNotExistException) {
            return null;
        }
    }

    /** @return int[] feature IDs the user has voted on */
    public function findVotedFeatureIds(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('feature_id')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        $result = $qb->executeQuery();
        $ids = [];
        while ($row = $result->fetch()) {
            $ids[] = (int)$row['feature_id'];
        }
        $result->closeCursor();
        return $ids;
    }
}
