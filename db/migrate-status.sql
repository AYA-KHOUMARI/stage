USE inventory_reconciliation;

ALTER TABLE inventory_items
  MODIFY result_status ENUM('Traité','Deplacé','Non_Trouvé','Nouveau') NOT NULL DEFAULT 'Non_Trouvé';

ALTER TABLE comparison_results
  MODIFY result_status ENUM('Traité','Deplacé','Non_Trouvé','Nouveau') NOT NULL;
