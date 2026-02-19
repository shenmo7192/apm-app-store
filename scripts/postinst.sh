#!/usr/bin/bash

cp -fv /opt/spark-store/extras/store.spark-app.amber-pm-store.policy /usr/share/polkit-1/actions/store.spark-app.amber-pm-store.policy
xdg-mime default spark-store.desktop x-scheme-handler/spk
update-mime-database /usr/share/mime || true