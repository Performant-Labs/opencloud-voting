<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class FeatureMapper extends QBMapper {
    public const TABLE_NAME = 'featurevoting_features';

    public function __construct(IDBConnection $db) {
        parent::__construct($db, self::TABLE_NAME, Feature::class);
    }

    /** @return Feature[] */
    public function findAll(): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->orderBy('vote_count', 'DESC')
            ->addOrderBy('created_at', 'DESC');
        return $this->findEntities($qb);
    }

    public function findById(int $id): Feature {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
        return $this->findEntity($qb);
    }

    public function incrementVote(int $featureId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update($this->getTableName())
            ->set('vote_count', $qb->func()->add('vote_count', $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT)))
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($featureId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }

    public function decrementVote(int $featureId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update($this->getTableName())
            ->set('vote_count', $qb->func()->subtract('vote_count', $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT)))
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($featureId, IQueryBuilder::PARAM_INT)));
        $qb->executeStatement();
    }
}
