<?php

declare(strict_types=1);

namespace OCA\FeatureVoting\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method int    getId()
 * @method string getTitle()
 * @method void   setTitle(string $title)
 * @method string getDescription()
 * @method void   setDescription(string $description)
 * @method string getUserId()
 * @method void   setUserId(string $userId)
 * @method int    getVoteCount()
 * @method void   setVoteCount(int $voteCount)
 * @method string getCreatedAt()
 * @method void   setCreatedAt(string $createdAt)
 */
class Feature extends Entity implements \JsonSerializable {
    protected string $title = '';
    protected string $description = '';
    protected string $userId = '';
    protected int $voteCount = 0;
    protected string $createdAt = '';

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('voteCount', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id'          => $this->id,
            'title'       => $this->title,
            'description' => $this->description,
            'userId'      => $this->userId,
            'voteCount'   => $this->voteCount,
            'createdAt'   => $this->createdAt,
        ];
    }
}
