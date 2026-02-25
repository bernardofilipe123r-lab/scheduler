"""
Cross-Brand Intelligence — Knowledge transfer between brands under the same user.

Three types of transfer:
1. Cold-Start: New brand inherits priors from similar existing brand
2. Universal Rules: Some rules apply across all brands
3. Negative Transfer Guard: Prevent transferring brand-specific rules
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.toby import TobyStrategyScore, TobyActivityLog
from app.models.toby_cognitive import TobyProceduralMemory


class CrossBrandIntelligence:
    """Transfer learning between brands under the same user."""

    def get_transferable_rules(
        self,
        db: Session,
        user_id: str,
        source_brand: str,
        target_brand: str,
    ) -> list[dict]:
        """Find procedural rules from source brand that might help target brand.

        Only transfers rules that are:
        - Active with success_rate >= 0.6
        - Applied at least 5 times
        - Likely brand-agnostic (no brand-specific references)
        """
        source_rules = (
            db.query(TobyProceduralMemory)
            .filter(
                TobyProceduralMemory.user_id == user_id,
                TobyProceduralMemory.brand_id == source_brand,
                TobyProceduralMemory.is_active == True,
                TobyProceduralMemory.success_rate >= 0.6,
                TobyProceduralMemory.applied_count >= 5,
            )
            .all()
        )

        transferable = []
        for rule in source_rules:
            if self._is_brand_agnostic(rule, source_brand):
                transferable.append({
                    "rule_id": str(rule.id),
                    "rule": rule.rule_text,
                    "conditions": rule.conditions,
                    "action": rule.action,
                    "source_brand": source_brand,
                    "source_success_rate": rule.success_rate,
                    "transfer_confidence": rule.confidence * 0.7,  # Discount
                })

        return transferable

    def transfer_rules(
        self,
        db: Session,
        user_id: str,
        source_brand: str,
        target_brand: str,
    ) -> int:
        """Transfer applicable rules from source to target brand.

        Returns the number of rules transferred.
        """
        transferable = self.get_transferable_rules(
            db, user_id, source_brand, target_brand
        )

        count = 0
        for rule_data in transferable:
            # Check if a similar rule already exists for target
            existing = (
                db.query(TobyProceduralMemory)
                .filter(
                    TobyProceduralMemory.user_id == user_id,
                    TobyProceduralMemory.brand_id == target_brand,
                    TobyProceduralMemory.rule_text == rule_data["rule"],
                )
                .first()
            )
            if existing:
                continue

            new_rule = TobyProceduralMemory(
                user_id=user_id,
                brand_id=target_brand,
                rule_text=rule_data["rule"],
                conditions=rule_data["conditions"],
                action=rule_data["action"],
                confidence=rule_data["transfer_confidence"],
                source_semantic_ids=[rule_data["rule_id"]],
                is_active=True,
            )
            db.add(new_rule)
            count += 1

        if count > 0:
            log = TobyActivityLog(
                user_id=user_id,
                action_type="cross_brand_transfer",
                description=f"Transferred {count} rules from {source_brand} to {target_brand}",
                metadata={
                    "source_brand": source_brand,
                    "target_brand": target_brand,
                    "rules_transferred": count,
                },
                level="info",
            )
            db.add(log)
            db.commit()

        return count

    def bootstrap_new_brand(
        self,
        db: Session,
        user_id: str,
        new_brand_id: str,
        similar_brand_id: str,
    ) -> dict:
        """Bootstrap a new brand's Thompson Sampling priors from a similar brand.

        Copies priors at 50% weight (uncertainty discount).
        Returns count of priors and rules transferred.
        """
        result = {"priors_transferred": 0, "rules_transferred": 0}

        # Copy strategy scores at 50% weight
        source_scores = (
            db.query(TobyStrategyScore)
            .filter(
                TobyStrategyScore.user_id == user_id,
                TobyStrategyScore.brand_id == similar_brand_id,
                TobyStrategyScore.sample_count > 2,
            )
            .all()
        )

        for score in source_scores:
            # Check if target already has this score
            existing = (
                db.query(TobyStrategyScore)
                .filter(
                    TobyStrategyScore.user_id == user_id,
                    TobyStrategyScore.brand_id == new_brand_id,
                    TobyStrategyScore.content_type == score.content_type,
                    TobyStrategyScore.dimension == score.dimension,
                    TobyStrategyScore.option_value == score.option_value,
                )
                .first()
            )

            if existing:
                continue

            new_score = TobyStrategyScore(
                id=str(uuid.uuid4()),
                user_id=user_id,
                brand_id=new_brand_id,
                content_type=score.content_type,
                dimension=score.dimension,
                option_value=score.option_value,
                sample_count=max(1, score.sample_count // 2),
                total_score=score.total_score / 2,
                avg_score=score.avg_score,
                score_variance=score.score_variance * 2 if score.score_variance else 100.0,
                best_score=score.best_score,
                worst_score=score.worst_score,
            )
            db.add(new_score)
            result["priors_transferred"] += 1

        # Transfer rules
        result["rules_transferred"] = self.transfer_rules(
            db, user_id, similar_brand_id, new_brand_id
        )

        if result["priors_transferred"] > 0 or result["rules_transferred"] > 0:
            log = TobyActivityLog(
                user_id=user_id,
                action_type="cross_brand_bootstrap",
                description=(
                    f"Bootstrapped {new_brand_id} from {similar_brand_id}: "
                    f"{result['priors_transferred']} priors, {result['rules_transferred']} rules"
                ),
                metadata=result,
                level="success",
            )
            db.add(log)
            db.commit()

        return result

    @staticmethod
    def _is_brand_agnostic(rule: TobyProceduralMemory, brand_id: str) -> bool:
        """Check if a rule is likely brand-agnostic (transferable).

        Heuristic: if the rule text doesn't reference the brand name,
        it's probably universal.
        """
        rule_lower = (rule.rule_text or "").lower()
        brand_lower = (brand_id or "").lower()

        # If the brand name appears in the rule, it's brand-specific
        if brand_lower and brand_lower in rule_lower:
            return False

        # Rules about specific brand assets are not transferable
        brand_specific_keywords = ["logo", "mascot", "slogan", "brand color", "our handle"]
        for kw in brand_specific_keywords:
            if kw in rule_lower:
                return False

        return True
