"use client";

import { useState } from "react";
import { Mormi } from "./Mormi";
import type { DemoAccount } from "@/lib/demo-accounts";

const AVATARS = ["🌱", "⭐", "🚀", "🍀"];

export function DemoLogin({
  accounts,
  onSelect,
  onCreate,
}: {
  accounts: DemoAccount[];
  onSelect: (account: DemoAccount) => void;
  onCreate: (name: string, avatar: string) => void;
}) {
  const [adding, setAdding] = useState(accounts.length === 0);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);

  function submit() {
    if (!name.trim()) return;
    onCreate(name.trim(), avatar);
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-hero">
          <div className="login-character" aria-hidden="true">
            <Mormi mood="happy" size={230} />
          </div>
          <span className="login-kicker">MORMI LEARNING ROOM</span>
          <h1>누가 공부하러 왔나요?</h1>
          <p>내 계정을 고르면 모르미가 배운 내용을 기억해요.</p>
        </div>

        <div className="login-panel">
          {!adding && accounts.length > 0 && (
            <>
              <p className="login-panel__label">계정을 선택해요</p>
              <div className="account-grid">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    className="account-card"
                    onClick={() => onSelect(account)}
                  >
                    <span className="account-card__avatar">{account.avatar}</span>
                    <span className="account-card__name">{account.name}</span>
                    <span className="account-card__hint">이어하기</span>
                  </button>
                ))}
              </div>
              <button className="add-account-button" onClick={() => setAdding(true)}>
                ＋ 새 계정 만들기
              </button>
            </>
          )}

          {adding && (
            <div className="create-account">
              <div>
                <p className="login-panel__label">새 계정을 만들어요</p>
                <p className="create-account__help">이 기기 안에만 저장되는 시연용 계정이에요.</p>
              </div>
              <div className="avatar-picker" aria-label="프로필 그림 선택">
                {AVATARS.map((item) => (
                  <button
                    key={item}
                    className={avatar === item ? "is-selected" : ""}
                    onClick={() => setAvatar(item)}
                    aria-label={`${item} 프로필`}
                    aria-pressed={avatar === item}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="account-name-field">
                <span>이름</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
                  }}
                  placeholder="이름을 입력해요"
                  autoFocus
                />
              </label>
              <button className="primary-action w-full py-4 text-[16px]" disabled={!name.trim()} onClick={submit}>
                내 계정 만들기
              </button>
              {accounts.length > 0 && (
                <button className="login-back" onClick={() => setAdding(false)}>계정 선택으로 돌아가기</button>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
