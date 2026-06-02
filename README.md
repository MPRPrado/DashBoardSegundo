# Dashboard Ranking

Sistema local para gerenciar e exibir um ranking de grupos por turma.

## Funcionalidades

- Ranking público com destaque para o TOP 3.
- Filtro por turma.
- Painel administrativo com login.
- Cadastro e exclusão de grupos.
- Cadastro e exclusão de integrantes.
- Alteração de pontuação com botões `+100`, `+50`,`+10`, `-10`, `-50` e `-100`.
- Pontuação mínima travada em `0`.
- Bloqueio de grupos duplicados na mesma turma.
- Acesso pelo celular na mesma rede do computador.

## Como Rodar

Instale as dependências:

```powershell
npm install
```

Inicie o servidor:

```powershell
npm start
```

Abra no navegador:

```txt
http://localhost:3000
```

## Acesso Pelo Celular

Ao iniciar o servidor, o terminal mostra endereços parecidos com:

```txt
Celular na mesma rede: http://10.0.0.40:3000
```

Abra esse endereço no navegador do celular. O celular precisa estar na mesma rede do computador.

Se não abrir, verifique se o Firewall do Windows permitiu o Node.js na rede privada.

## Área Admin

Acesse:

```txt
http://localhost:3000/admin.html
```

Senha inicial em um banco novo:

```txt
admin123
```

Depois de entrar, use a opção **Alterar Senha**. A senha é salva com hash no banco.

## Banco de Dados

O banco fica no arquivo:

```txt
ranking.db
```

Tudo que for criado pelo computador ou pelo celular é salvo nesse arquivo local, porque o celular acessa o servidor rodando no computador.

Como o `ranking.db` está versionado no Git, quem clonar o repositório recebe os dados que estavam no banco no momento do último commit. Mudanças feitas depois só vão para outras pessoas se você commitar e der push no `ranking.db` atualizado.

## Variáveis Opcionais

Você pode mudar a porta:

```powershell
$env:PORT="3001"
npm start
```

Você pode definir uma senha inicial para um banco novo:

```powershell
$env:ADMIN_INITIAL_PASSWORD="suaSenha"
npm start
```

Você também pode definir o segredo da sessão:

```powershell
$env:SESSION_SECRET="um-segredo-local"
npm start
```

## Estrutura

```txt
public/
  admin.html
  index.html
  styles.css
server.js
ranking.db
package.json
```

## Observações

- O projeto foi pensado para uso local.
- `node_modules/` não deve ser enviado para o GitHub.
- `server.log` não deve ser enviado para o GitHub.
- Para parar o servidor, pressione `Ctrl + C` no terminal onde o `npm start` está rodando.
