-- Local-only draft; names and descriptions require editorial validation before publication.
INSERT OR IGNORE INTO polls(id,slug,organization,title_fr,title_en,description_fr,description_en)
VALUES ('demo-creation','giocoso-creation','Giocoso Creation','Modèles Giocoso Creation','Giocoso Creation models','Démonstration locale — contenu à valider.','Local demonstration — content awaiting review.');
INSERT OR IGNORE INTO poll_options(id,poll_id,name_fr,name_en,image_key,sort_order) VALUES
('altitude','demo-creation','Altitude','Altitude','altitude.jpg',1),
('cardinal','demo-creation','Cardinal','Cardinal','cardinal.jpg',2),
('geai-bleu','demo-creation','Geai bleu','Blue jay','geai_bleu.jpg',3),
('grandpic','demo-creation','Grand pic','Pileated woodpecker','grandpic.jpg',4),
('introspection','demo-creation','Introspection','Introspection','introspection.jpg',5),
('mesange','demo-creation','Mésange','Chickadee','mesange.jpg',6),
('yourie','demo-creation','Yourie magnifique','Yourie magnifique','yourie_magnifique.jpg',7);
