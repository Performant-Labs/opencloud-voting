<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method int    getId()
 * @method int    getFeatureId()
 * @method void   setFeatureId(int $featureId)
 * @method string getUserId()
 * @method void   setUserId(string $userId)
 */
class Vote extends Entity {
    protected int $featureId = 0;
    protected string $userId = '';

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('featureId', 'integer');
    }
}
