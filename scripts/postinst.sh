#!/usr/bin/bash

cp -fv /opt/apm-store/extras/store.spark-app.amber-pm-store.policy /usr/share/polkit-1/actions/store.spark-app.amber-pm-store.policy
xdg-mime default apm-store.desktop x-scheme-handler/apmstore
update-mime-database /usr/share/mime || true