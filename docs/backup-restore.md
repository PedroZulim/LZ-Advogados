# Backup e restauração — procedimento inicial

Migrations e seed estão versionados. Isso permite reconstruir o schema e dados sintéticos, mas não substitui backup de dados de produção.

Em ambiente de teste provisionado, com conexão PostgreSQL configurada em `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGSSLMODE` e credencial por arquivo seguro `.pgpass`:

```sh
pg_dump --format=custom --no-owner --file=backup.dump
pg_restore --list backup.dump
```

Guardar o arquivo cifrado fora do Git, com acesso restrito e retenção definida. Um dump contém dados sensíveis, inclusive quando inclui o schema Auth. Não exibir credenciais em argumentos ou logs.

Restaurar apenas em banco vazio de teste compatível, configurando as variáveis de conexão para o destino antes de executar:

```sh
pg_restore --no-owner --exit-on-error --dbname=nome_do_banco_de_teste backup.dump
```

Revisar ownership/grants, extensões e compatibilidade do Auth com o Supabase de destino; testar migrations, contagens, integridade referencial, isolamento RLS, acesso e MFA. Buckets/arquivos e configurações externas de Auth/SMTP não são recuperados por esse comando.

Este procedimento é um ponto de partida e não foi exercitado contra um projeto Supabase. Antes de dados reais: executar ensaio documentado, definir RPO/RTO, retenção, responsável, monitoramento de falha e cobertura de Auth/Storage, e revisar os recursos de backup do plano contratado. Não considerar backup validado apenas porque o dump foi gerado.
